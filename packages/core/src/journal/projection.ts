import { Array, Context, Effect, Option, Schema } from "effect";
import { Checkpoint } from "./checkpoint.ts";
import { Event } from "./event.ts";
import type { Fact } from "./fact.ts";
import type { Log } from "./log.ts";
import { Store } from "./store.ts";
import { Transaction } from "./transaction.ts";

/** The decoded event supplied to a handler for this fact. */
export type Input<F extends Fact.Definition> = Event.Type<F>;

export interface Subscription<E, R> {
  readonly fact: Fact.Definition;
  /** Validates a decoded event and applies it within the current transaction. */
  readonly apply: (
    event: unknown,
  ) => Effect.Effect<void, E | Schema.SchemaError, R | Store.Transaction>;
  /** Decode this fact version once before dispatching to its handlers. */
  readonly decode: (
    entry: Log.Value<Event.Payload>,
  ) => Effect.Effect<unknown, Schema.SchemaError | Event.FactMismatch, R>;
}

/** A versioned read-model definition with subscriptions in registration order. */
export interface Definition<
  Name extends string = string,
  Version extends number = number,
  E = never,
  R = never,
> {
  readonly name: Name;
  readonly version: Version;
  readonly subscriptions: ReadonlyArray<Subscription<E, R>>;
  readonly on: <F extends Fact.Definition, E2, R2>(
    fact: F,
    handle: (event: Input<NoInfer<F>>) => Effect.Effect<void, E2, R2>,
  ) => Definition<Name, Version, E | E2, R | R2 | F["payload"]["DecodingServices"]>;
}

const makeDefinition = <Name extends string, Version extends number, E, R>(
  name: Name,
  version: Version,
  subscriptions: ReadonlyArray<Subscription<E, R>>,
): Definition<Name, Version, E, R> => ({
  name,
  version,
  subscriptions,
  on<F extends Fact.Definition, E2, R2>(
    fact: F,
    handle: (event: Input<NoInfer<F>>) => Effect.Effect<void, E2, R2>,
  ) {
    const validate = Schema.decodeUnknownEffect(
      Schema.toType(Event.makeSchema<F["name"], F["version"], F["payload"]>(fact)),
    );
    const apply = Effect.fn(`${name}.project.${fact.name}`)(function* (event: unknown) {
      yield* Store.Transaction;
      const input = yield* validate(event);
      yield* Transaction.withoutAppends(
        handle(input),
        `Projection ${name} cannot publish new log entries`,
      );
    });

    const decode = Effect.fn(`${name}.decode.${fact.name}`)(function* (
      entry: Log.Value<Event.Payload>,
    ) {
      return yield* Transaction.withoutAppends(
        Event.decode(fact, entry),
        `Projection ${name} cannot publish new log entries`,
      );
    });

    return makeDefinition<Name, Version, E | E2, R | R2 | F["payload"]["DecodingServices"]>(
      name,
      version,
      [...subscriptions, { fact, apply, decode }],
    );
  },
});

/**
 * Starts a projection definition. Each on call returns a new definition.
 * Handlers update transaction-participating domain stores using event data;
 * they must remain safe to replay without external actions or new publications.
 *
 * @category constructors
 */
export const make = <const Name extends string, const Version extends number>(
  name: Name,
  options: { readonly version: Version },
): Definition<Name, Version> =>
  makeDefinition<Name, Version, never, never>(name, options.version, []);

export class Behind extends Schema.TaggedError<Behind>()("Projection.Behind", {
  key: Checkpoint.Key,
}) {}
export class InvalidCheckpoint extends Schema.TaggedError<InvalidCheckpoint>()(
  "Projection.InvalidCheckpoint",
  { key: Checkpoint.Key, message: Schema.String },
) {}
export class UnsupportedFactVersion extends Schema.TaggedError<UnsupportedFactVersion>()(
  "Projection.UnsupportedFactVersion",
  { key: Checkpoint.Key, name: Schema.String, version: Schema.Finite },
) {}
export class Duplicate extends Schema.TaggedError<Duplicate>()("Projection.Duplicate", {
  key: Checkpoint.Key,
}) {}
/** An expected decoder or handler failure, preserving its original error. */
export class Failure extends Schema.TaggedError<Failure>()("Projection.Failure", {
  key: Checkpoint.Key,
  cursor: Checkpoint.Cursor,
  phase: Schema.Literals(["decode", "apply"]),
  cause: Schema.Defect(),
}) {}

export type Error =
  | Transaction.Error
  | Schema.SchemaError
  | Event.FactMismatch
  | Behind
  | InvalidCheckpoint
  | UnsupportedFactVersion
  | Failure;

export interface Runner {
  readonly key: Checkpoint.Key;
  readonly checkpoint: Effect.Effect<
    Option.Option<Checkpoint.Cursor>,
    Store.Failure | Schema.SchemaError
  >;
  /** Apply the next source batch and checkpoint it in one transaction. None means caught up. */
  readonly step: Effect.Effect<Option.Option<Checkpoint.Cursor>, Error>;
  /** Drain until no pending batch is observed. Each step commits independently unless already in a commit. */
  readonly replay: Effect.Effect<Option.Option<Checkpoint.Cursor>, Error>;
  /** Journal integration: apply a newly appended, decoded event only when caught up. */
  readonly apply: (
    entry: Log.Value<Event.Payload>,
    event: unknown,
  ) => Effect.Effect<void, Error, Store.Transaction>;
}

const cursorOf = (entry: Log.Value<Event.Payload>): Checkpoint.Cursor => ({
  position: entry.position,
  commitId: entry.commitId,
  index: entry.index,
  entryId: entry.id,
});

/**
 * Construct a runner from a definition, its dependencies, and its host-owned checkpoint store.
 * Invocation context takes precedence, preserving the current transaction and
 * scope. A new version needs a fresh target or a domain-managed migration.
 *
 * @category constructors
 */
export const makeRunner = Effect.fn("Projection.makeRunner")(function* <E, R>(options: {
  readonly definition: Definition<string, number, E, R>;
  readonly log: Log.Reader<typeof Event.Payload>;
}) {
  const checkpoints = yield* Checkpoint.Service;
  const transaction = yield* Transaction.Service;
  const services = yield* Effect.context<Transaction.Remaining<R>>();
  const { definition, log } = options;
  const key = yield* Schema.decodeEffect(Checkpoint.Key)({
    logId: log.id,
    name: definition.name,
    version: definition.version,
  });
  const byName = new Map<string, Map<number, Array<Subscription<E, R>>>>();
  for (const subscription of definition.subscriptions) {
    const { fact } = subscription;
    let versions = byName.get(fact.name);
    if (versions === undefined) {
      versions = new Map();
      byName.set(fact.name, versions);
    }
    const handlers = versions.get(fact.version) ?? [];
    if (handlers.some((handler) => handler.fact.payload !== fact.payload)) {
      return yield* new Event.FactMismatch({ name: fact.name, version: fact.version });
    }
    versions.set(fact.version, [...handlers, subscription]);
  }

  const checkpoint = checkpoints
    .get(key)
    .pipe(Effect.flatMap(Schema.decodeEffect(Schema.Option(Checkpoint.Cursor))));
  const next = Effect.fnUntraced(function* () {
    const native = yield* Store.Transaction;
    const previous = yield* checkpoint;
    if (Option.isSome(previous)) {
      const cursor = previous.value;
      const batch = yield* log.get(cursor.commitId);
      if (
        Option.isNone(batch) ||
        batch.value.position !== cursor.position ||
        batch.value.entries[cursor.index]?.id !== cursor.entryId
      ) {
        return yield* new InvalidCheckpoint({
          key,
          message: "Checkpoint does not identify a source entry",
        });
      }
      const remaining = batch.value.entries.slice(cursor.index + 1);
      if (remaining.length > 0) {
        if (batch.value.commit.id !== native.id) {
          return yield* new InvalidCheckpoint({
            key,
            message: "Checkpoint splits a committed source batch",
          });
        }
        return Option.some(remaining);
      }
    }
    const batches = yield* log.read(
      Option.isSome(previous) ? { after: previous.value.position, limit: 1 } : { limit: 1 },
    );
    return Option.map(Array.head(batches), (batch) => batch.entries);
  });
  const handlersFor = Effect.fnUntraced(function* (entry: Log.Value<Event.Payload>) {
    const versions = byName.get(entry.payload.name);
    if (versions === undefined) return [];
    const handlers = versions.get(entry.payload.version);
    if (handlers === undefined) {
      return yield* new UnsupportedFactVersion({
        key,
        name: entry.payload.name,
        version: entry.payload.version,
      });
    }
    return handlers;
  });

  // Supply static requirements only after entering the operation's transaction.
  // The invocation's context must win over any context present during binding.
  const withServices = Effect.fnUntraced(function* <A, E2>(
    program: Effect.Effect<A, E2, R | Store.Transaction>,
  ) {
    const native = yield* Store.Transaction;
    return yield* program.pipe(
      Effect.scoped,
      Effect.provideService(Store.Transaction, native),
      Effect.updateContext((current: Context.Context<never>) => Context.merge(services, current)),
    );
  });
  const failed = (entry: Log.Value<Event.Payload>, phase: Failure["phase"]) => (cause: unknown) =>
    new Failure({ key, cursor: cursorOf(entry), phase, cause });

  const apply = Effect.fn("Projection.apply")(function* (
    entry: Log.Value<Event.Payload>,
    event: unknown,
  ) {
    const native = yield* Store.Transaction;
    yield* transaction.operation(
      withServices(
        Effect.gen(function* () {
          if (entry.logId !== log.id || entry.commitId !== native.id)
            return yield* new Transaction.Foreign({});
          const pending = yield* next();
          if (
            Option.isNone(pending) ||
            pending.value.length !== 1 ||
            pending.value[0]?.id !== entry.id
          )
            return yield* new Behind({ key });
          for (const handler of yield* handlersFor(entry))
            yield* handler.apply(event).pipe(Effect.mapError(failed(entry, "apply")));
          yield* checkpoints.set(key, cursorOf(entry));
        }),
      ),
    );
  });
  const step = transaction
    .operation(
      withServices(
        Effect.gen(function* () {
          const pending = yield* next();
          if (Option.isNone(pending)) return Option.none<Checkpoint.Cursor>();
          for (const entry of pending.value) {
            const handlers = yield* handlersFor(entry);
            const first = Array.head(handlers);
            if (Option.isSome(first)) {
              const event = yield* first.value
                .decode(entry)
                .pipe(Effect.mapError(failed(entry, "decode")));
              for (const handler of handlers)
                yield* handler.apply(event).pipe(Effect.mapError(failed(entry, "apply")));
            }
          }
          const last = Array.last(pending.value);
          if (Option.isNone(last)) {
            return yield* new InvalidCheckpoint({ key, message: "Source returned an empty batch" });
          }
          const cursor = cursorOf(last.value);
          yield* checkpoints.set(key, cursor);
          return Option.some(cursor);
        }),
      ),
    )
    .pipe(Effect.withSpan("Projection.step"));
  const replay = Effect.gen(function* () {
    while (true) {
      const progress = yield* step;
      if (Option.isNone(progress)) return yield* checkpoint;
    }
  }).pipe(Effect.withSpan("Projection.replay"));

  const runner: Runner = { key, checkpoint, step, replay, apply };
  return runner;
});

export * as Projection from "./projection.ts";

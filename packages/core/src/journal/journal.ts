import { Context, Effect, Layer, Option, Schema } from "effect";
import { Checkpoint } from "./checkpoint.ts";
import { Codec } from "./codec.ts";
import { Event } from "./event.ts";
import { Fact } from "./fact.ts";
import { Log } from "./log.ts";
import { Projection } from "./projection.ts";
import { Publication } from "./publication.ts";
import { Store } from "./store.ts";
import { Transaction } from "./transaction.ts";

export { Envelope, FactMismatch, decode, storageCodec } from "./event.ts";

export interface Interface {
  readonly log: Log.Reader<typeof Event.Envelope>;
  /** Read matching envelopes by fact name and/or subject, ordered by position and entry index. */
  readonly read: (
    options: Store.ReadFactsOptions,
  ) => Effect.Effect<ReadonlyArray<Log.Entry<Event.Envelope>>, Log.ReadError>;
  readonly commit: Transaction.Interface["run"];
  /**
   * Make exactly the registered projections live before accepting publications: rebuild any
   * that are not live from the log, and retire live versions this journal does not run, which
   * later resume from the last commit they applied. When every registered projection is live,
   * this reads nothing but the live versions. An empty log has nothing to rebuild, and its
   * first commit makes the projections live, so replaying it writes nothing.
   */
  readonly replay: Effect.Effect<void, Projection.Error>;
  /**
   * Stamp trusted operation attribution and derive a key from the fact's occurrence rule.
   * Explicit keys are allowed only when no key is derived. Matching retries return the
   * original event without applying projections; conflicting content aborts.
   */
  readonly publish: <F extends Fact.Definition>(
    fact: F,
    payload: Fact.Payload<NoInfer<F>>,
    options?: Store.AppendOptions,
  ) => Effect.Effect<
    Event.Type<F>,
    Projection.Error | Log.WriteError,
    | Publication.Service
    | Transaction.Remaining<F["payload"]["EncodingServices"] | F["payload"]["DecodingServices"]>
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/Service",
) {}

export interface Options<Requirements extends ReadonlyArray<unknown> = readonly []> {
  readonly logId: Log.Id;
  /** Infer each projection's requirements separately, then combine them at construction. */
  readonly projections: {
    readonly [Index in keyof Requirements]: Projection.Definition<
      string,
      number,
      unknown,
      Requirements[Index]
    >;
  };
}

/**
 * Construct a domain journal from a log and its projections. Definitions sharing a fact
 * name and version must share its payload schema, subject function, and occurrence function. Projection
 * dependencies are supplied here; the resulting service interface is independent of registration.
 *
 * @category constructors
 */
export const make = Effect.fn("Journal.make")(function* <
  const Requirements extends ReadonlyArray<unknown>,
>(options: Options<Requirements>) {
  const logs = yield* Log.Service;
  const transaction = yield* Transaction.Service;
  const checkpoints = yield* Checkpoint.Service;
  const log = logs.open({
    id: options.logId,
    schema: Event.Envelope,
    storageCodec: Event.storageCodec,
  });
  const validateProvenance = Schema.decodeUnknownEffect(
    Schema.toType(Event.Provenance).check(
      Schema.makeFilter((value) =>
        value.workspaceId === transaction.workspaceId
          ? undefined
          : "Publication belongs to another workspace",
      ),
    ),
  );
  const subscriptions = options.projections.flatMap((projection) => projection.subscriptions);
  const definitions = new Map<string, Map<number, Fact.Definition>>();
  for (const { fact } of subscriptions) {
    let versions = definitions.get(fact.name);
    if (versions === undefined) {
      versions = new Map();
      definitions.set(fact.name, versions);
    }
    const existing = versions.get(fact.version);
    if (
      existing !== undefined &&
      (existing.payload !== fact.payload ||
        existing.occurrence !== fact.occurrence ||
        existing.subject !== fact.subject)
    ) {
      return yield* new Event.FactMismatch({ name: fact.name, version: fact.version });
    }
    versions.set(fact.version, fact);
  }
  const runners: Array<Projection.Runner> = [];
  const keys = new Map<string, Set<number>>();
  for (const definition of options.projections) {
    if (keys.get(definition.name)?.has(definition.version)) {
      return yield* new Projection.Duplicate({
        key: { logId: log.id, name: definition.name, version: definition.version },
      });
    }
    const versions = keys.get(definition.name) ?? new Set<number>();
    versions.add(definition.version);
    keys.set(definition.name, versions);
    runners.push(yield* Projection.makeRunner<unknown, Requirements[number]>({ definition, log }));
  }
  // Each fact goes only to the projections that handle its name, in registration order.
  const subscribers = new Map<string, ReadonlyArray<Projection.Runner>>();
  for (const { fact } of subscriptions)
    if (!subscribers.has(fact.name))
      subscribers.set(
        fact.name,
        runners.filter((runner) => runner.subscribes(fact.name)),
      );
  const registeredVersions = runners.map(({ key }) => ({ name: key.name, version: key.version }));
  const registered = (live: Checkpoint.LiveVersion) =>
    runners.some((runner) => Projection.isVersion(runner.key)(live));
  const keyOf = (live: Checkpoint.LiveVersion): Checkpoint.Key => ({
    logId: log.id,
    name: live.name,
    version: live.version,
  });

  /**
   * A commit applies exactly the live projections, so it may publish only when those are the
   * registered ones. An empty log has nothing to rebuild, so its first commit makes them live.
   * Checked once per native transaction, before its first publication.
   */
  const checked = new WeakSet<object>();
  const requireLive = Effect.fnUntraced(function* () {
    const native = yield* Store.Transaction;
    if (checked.has(native)) return;
    const live = yield* checkpoints.listLive(log.id);
    const behind = runners.find((runner) => !live.some(Projection.isVersion(runner.key)));
    const unknown = live.find((version) => !registered(version));
    if (behind !== undefined || unknown !== undefined) {
      if ((yield* log.read({ limit: 1 })).length > 0) {
        if (behind !== undefined) return yield* new Projection.Behind({ key: behind.key });
        if (unknown !== undefined)
          return yield* new Projection.Unregistered({ key: keyOf(unknown) });
      }
      yield* checkpoints.setLive(log.id, registeredVersions);
    }
    checked.add(native);
  });

  const publish = Effect.fn("Journal.publish")(function* <F extends Fact.Definition>(
    fact: F,
    payload: Fact.Payload<NoInfer<F>>,
    options: Store.AppendOptions = {},
  ) {
    return yield* transaction.operation(
      Effect.gen(function* () {
        yield* requireLive();
        const provenance = Event.snapshotProvenance(
          yield* validateProvenance(yield* Publication.Service),
        );
        const request = yield* Schema.decodeEffect(Store.AppendOptions)(options);
        const registered = definitions.get(fact.name)?.get(fact.version);
        if (
          registered !== undefined &&
          (registered.payload !== fact.payload ||
            registered.occurrence !== fact.occurrence ||
            registered.subject !== fact.subject)
        ) {
          return yield* new Event.FactMismatch({ name: fact.name, version: fact.version });
        }
        const encoded = yield* Codec.make(fact).encode(payload);
        const subject = yield* Fact.makeSubject(fact, payload);
        const occurrenceKey = yield* Fact.makeOccurrenceKey(fact, payload);
        if (occurrenceKey !== null && request.idempotencyKey !== undefined)
          return yield* new Store.Conflict({
            operation: "publish",
            message: "A fact's declared occurrence identity cannot be overridden",
          });
        const appendOptions =
          occurrenceKey === null ? request : { ...request, idempotencyKey: occurrenceKey };
        if (appendOptions.idempotencyKey !== undefined) {
          const found = yield* log.getAppend(appendOptions.idempotencyKey);
          if (Option.isSome(found)) {
            const entry = found.value[0];
            if (
              found.value.length !== 1 ||
              entry === undefined ||
              entry.payload.name !== fact.name ||
              entry.payload.version !== fact.version ||
              entry.payload.subject !== subject ||
              !Store.samePayloads([entry.payload.payload], [encoded])
            )
              return yield* new Store.Conflict({
                operation: "publish",
                message: "Idempotency key is already associated with different content",
              });
            yield* validateProvenance(entry.payload.provenance);
            return yield* Event.decode(fact, entry);
          }
        }
        if (provenance.causedBy !== null) {
          const cause = provenance.causedBy;
          const source = logs.open({
            id: cause.logId,
            schema: Event.Envelope,
            storageCodec: Event.storageCodec,
          });
          // Look up the one cause entry; loading its batch would rescan an open commit per cause.
          const found = yield* source.getEntry(cause.id);
          const parent =
            Option.isSome(found) && found.value.commitId === cause.commitId
              ? found.value
              : undefined;
          const parentEnvelope = yield* Schema.decodeUnknownEffect(Schema.toType(Event.Envelope))(
            parent?.payload,
          );
          yield* validateProvenance(parentEnvelope.provenance);
          yield* Schema.decodeEffect(Schema.Literal(parentEnvelope.provenance.correlationId))(
            provenance.correlationId,
          );
        }
        const entry = yield* log.append(
          {
            provenance,
            subject,
            name: fact.name,
            version: fact.version,
            payload: encoded,
          },
          appendOptions,
        );
        const event = yield* Event.decode(fact, entry);
        for (const runner of subscribers.get(fact.name) ?? []) yield* runner.apply(entry, event);
        return event;
      }),
    );
  });

  const reader: Log.Reader<typeof Event.Envelope> = {
    id: log.id,
    schema: log.schema,
    get: log.get,
    getEntry: log.getEntry,
    getAppend: log.getAppend,
    read: log.read,
    head: log.head,
    stream: log.stream,
    tail: log.tail,
  };
  const replay = Effect.gen(function* () {
    const live = yield* checkpoints.listLive(log.id);
    const pending = runners.filter((runner) => !live.some(Projection.isVersion(runner.key)));
    if (pending.length === 0 && live.every(registered)) return;
    // An empty log waits for its first commit, which makes the registered projections live;
    // booting a workspace that was never created must leave nothing behind.
    if ((yield* log.read({ limit: 1 })).length === 0) return;
    // Live versions this journal does not run would stop its commits, so they are retired first.
    // Whoever runs a retired version again rebuilds it from the last commit it applied.
    if (!live.every(registered))
      yield* transaction.run(
        Effect.gen(function* () {
          const current = yield* checkpoints.listLive(log.id);
          if (!current.every(registered))
            yield* Projection.replaceLive(checkpoints, log, current, current.filter(registered));
        }),
      );
    for (const runner of pending) yield* runner.replay;
  }).pipe(Effect.withSpan("Journal.replay"));

  return Service.of({ log: reader, read: log.readFacts, commit: transaction.run, replay, publish });
});

/**
 * Provide the configured journal over the caller's log, transaction, and projection dependencies.
 *
 * @category layers
 */
export const layer = <const Requirements extends ReadonlyArray<unknown>>(
  options: Options<Requirements>,
) => Layer.effect(Service, make(options));

export * as Journal from "./journal.ts";

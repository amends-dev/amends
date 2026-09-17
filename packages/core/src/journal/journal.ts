import { Effect, Schema } from "effect";
import { Codec } from "./codec.ts";
import { Event } from "./event.ts";
import type { Fact } from "./fact.ts";
import { Log } from "./log.ts";
import type { Projection } from "./projection.ts";
import { Transaction } from "./transaction.ts";

/** The domain journal's log payload; other logs use their own schemas. */
export const Payload = Schema.Struct({
  name: Schema.String,
  version: Schema.Finite,
  payload: Schema.Uint8Array,
});
export interface Payload extends Schema.Schema.Type<typeof Payload> {}

export class FactMismatch extends Schema.TaggedError<FactMismatch>()("Journal.FactMismatch", {
  name: Schema.String,
  version: Schema.Finite,
}) {}

export interface Interface<E, R> {
  readonly log: Log.Reader<typeof Payload>;
  readonly commit: Transaction.Interface["run"];
  readonly publish: <F extends Fact.Definition>(
    fact: F,
    payload: Fact.Payload<NoInfer<F>>,
  ) => Effect.Effect<
    Event.Type<F>,
    E | FactMismatch | Log.WriteError,
    Transaction.Remaining<R | F["payload"]["EncodingServices"] | F["payload"]["DecodingServices"]>
  >;
}

/** Decode a recorded fact using its matching versioned definition. */
export const decode = Effect.fn("Journal.decode")(function* <F extends Fact.Definition>(
  fact: F,
  entry: Log.Value<Payload>,
) {
  if (entry.payload.name !== fact.name || entry.payload.version !== fact.version) {
    return yield* new FactMismatch({ name: fact.name, version: fact.version });
  }
  const payload = yield* Codec.make(fact).decode(entry.payload.payload);
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(Event.schema<F["name"], F["version"], F["payload"]>(fact)),
  )({ ...entry, name: fact.name, version: fact.version, payload });
});

/**
 * Bind a domain journal to a log and its projections. Definitions sharing a fact
 * name and version must share its payload schema. Handler services remain dynamic
 * requirements of publish, including the active host transaction's domain stores.
 */
export const make = Effect.fn("Journal.make")(function* <E = never, R = never>(options: {
  readonly logId: Log.Id;
  readonly projections: ReadonlyArray<Projection.Definition<string, number, E, R>>;
}) {
  const logs = yield* Log.Service;
  const transaction = yield* Transaction.Service;
  const log = logs.open({ id: options.logId, schema: Payload });
  const subscriptions = options.projections.flatMap((projection) => projection.subscriptions);
  const definitions = new Map<string, Map<number, Schema.Constraint>>();
  for (const { fact } of subscriptions) {
    let versions = definitions.get(fact.name);
    if (versions === undefined) {
      versions = new Map();
      definitions.set(fact.name, versions);
    }
    const existing = versions.get(fact.version);
    if (existing !== undefined && existing !== fact.payload) {
      return yield* new FactMismatch({ name: fact.name, version: fact.version });
    }
    versions.set(fact.version, fact.payload);
  }

  const publish = Effect.fn("Journal.publish")(function* <F extends Fact.Definition>(
    fact: F,
    payload: Fact.Payload<NoInfer<F>>,
  ) {
    return yield* transaction.operation(
      Effect.gen(function* () {
        const registered = definitions.get(fact.name)?.get(fact.version);
        if (registered !== undefined && registered !== fact.payload) {
          return yield* new FactMismatch({ name: fact.name, version: fact.version });
        }
        const entry = yield* log.append({
          name: fact.name,
          version: fact.version,
          payload: yield* Codec.make(fact).encode(payload),
        });
        const event = yield* decode(fact, entry);
        for (const subscription of subscriptions) {
          if (subscription.fact.name === fact.name && subscription.fact.version === fact.version) {
            yield* subscription.apply(event);
          }
        }
        return event;
      }),
    );
  });

  const reader: Log.Reader<typeof Payload> = {
    id: log.id,
    schema: log.schema,
    get: log.get,
    read: log.read,
    stream: log.stream,
  };
  const journal: Interface<E, R> = { log: reader, commit: transaction.run, publish };
  return journal;
});

export * as Journal from "./journal.ts";

import { Context, Effect, Layer } from "effect";
import type { Schema } from "effect";
import { Codec } from "./codec.ts";
import { Event } from "./event.ts";
import type { Fact } from "./fact.ts";
import { Log } from "./log.ts";
import { Projection } from "./projection.ts";
import { Transaction } from "./transaction.ts";

export { Payload, FactMismatch, decode } from "./event.ts";

export interface Interface {
  readonly log: Log.Reader<typeof Event.Payload>;
  readonly commit: Transaction.Interface["run"];
  /** Catch up registered projections before accepting new publications. */
  readonly replay: Effect.Effect<void, Projection.Error>;
  readonly publish: <F extends Fact.Definition>(
    fact: F,
    payload: Fact.Payload<NoInfer<F>>,
  ) => Effect.Effect<
    Event.Type<F>,
    Projection.Error | Log.WriteError,
    Transaction.Remaining<F["payload"]["EncodingServices"] | F["payload"]["DecodingServices"]>
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
 * name and version must share its payload schema. Projection dependencies are
 * supplied here; the resulting service interface is independent of registration.
 *
 * @category constructors
 */
export const make = Effect.fn("Journal.make")(function* <
  const Requirements extends ReadonlyArray<unknown>,
>(options: Options<Requirements>) {
  const logs = yield* Log.Service;
  const transaction = yield* Transaction.Service;
  const log = logs.open({ id: options.logId, schema: Event.Payload });
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
      return yield* new Event.FactMismatch({ name: fact.name, version: fact.version });
    }
    versions.set(fact.version, fact.payload);
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

  const publish = Effect.fn("Journal.publish")(function* <F extends Fact.Definition>(
    fact: F,
    payload: Fact.Payload<NoInfer<F>>,
  ) {
    return yield* transaction.operation(
      Effect.gen(function* () {
        const registered = definitions.get(fact.name)?.get(fact.version);
        if (registered !== undefined && registered !== fact.payload) {
          return yield* new Event.FactMismatch({ name: fact.name, version: fact.version });
        }
        const entry = yield* log.append({
          name: fact.name,
          version: fact.version,
          payload: yield* Codec.make(fact).encode(payload),
        });
        const event = yield* Event.decode(fact, entry);
        for (const runner of runners) yield* runner.apply(entry, event);
        return event;
      }),
    );
  });

  const reader: Log.Reader<typeof Event.Payload> = {
    id: log.id,
    schema: log.schema,
    get: log.get,
    read: log.read,
    stream: log.stream,
    tail: log.tail,
  };
  const replay = Effect.forEach(runners, (runner) => runner.replay, { discard: true }).pipe(
    Effect.withSpan("Journal.replay"),
  );
  return Service.of({ log: reader, commit: transaction.run, replay, publish });
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

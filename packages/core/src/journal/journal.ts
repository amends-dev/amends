import { Context, Effect, Layer, Option, Schema } from "effect";
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
  /** Catch up registered projections before accepting new publications. */
  readonly replay: Effect.Effect<void, Projection.Error>;
  /**
   * Stamp trusted operation attribution and derive a key from the fact's occurrence rule.
   * Explicit keys are allowed only when no key is derived. Matching retries return the
   * original event without applying projections or broadcasting; conflicting content aborts.
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

  const publish = Effect.fn("Journal.publish")(function* <F extends Fact.Definition>(
    fact: F,
    payload: Fact.Payload<NoInfer<F>>,
    options: Store.AppendOptions = {},
  ) {
    return yield* transaction.operation(
      Effect.gen(function* () {
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
          const batch = yield* source.get(cause.commitId);
          const parent = Option.isSome(batch)
            ? batch.value.entries.find((entry) => entry.id === cause.id)
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
        for (const runner of runners) yield* runner.apply(entry, event);
        yield* transaction.recordEvent(event);
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
    stream: log.stream,
    tail: log.tail,
  };
  const replay = Effect.forEach(runners, (runner) => runner.replay, { discard: true }).pipe(
    Effect.withSpan("Journal.replay"),
  );

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

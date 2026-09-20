import { Array, Context, Effect, Layer, PubSub, Schema, Semaphore, Stream } from "effect";
import type { Scope } from "effect";
import { WorkspaceId } from "../workspace/id.ts";
import { Commit } from "./commit.ts";
import { Event } from "./event.ts";

/** Existing decoded events in publication order, grouped by their committed transaction. */
export const Batch = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  commitId: Commit.Id,
  events: Schema.NonEmptyArray(Event.Record),
}).check(
  Schema.makeFilter((batch) => {
    const ids = new Set<Event.Id>();
    for (const event of batch.events) {
      if (event.commitId !== batch.commitId) return "Events must belong to the batch's commit";
      if (event.provenance !== null && event.provenance.workspaceId !== batch.workspaceId)
        return "Event provenance must belong to the batch's workspace";
      if (ids.has(event.id)) return "A batch cannot contain duplicate events";
      ids.add(event.id);
    }
    return undefined;
  }),
);
export interface Batch extends Schema.Schema.Type<typeof Batch> {}

export const Options = Schema.Struct({
  /** Maximum buffered batches; publishers never wait for subscribers to consume them. */
  capacity: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface Options extends Schema.Schema.Type<typeof Options> {}

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "CommittedEvents.WorkspaceMismatch",
  { expectedWorkspaceId: WorkspaceId.Id, actualWorkspaceId: WorkspaceId.Id },
) {}

export class Closed extends Schema.TaggedError<Closed>()("CommittedEvents.Closed", {
  workspaceId: WorkspaceId.Id,
}) {}

/** A slow subscriber missed batches. It must establish a new subscription and resynchronize. */
export class Lagged extends Schema.TaggedError<Lagged>()("CommittedEvents.Lagged", {
  workspaceId: WorkspaceId.Id,
}) {}

/**
 * Trusted internal broadcast for one workspace. Call publish only after a confirmed commit.
 * This bus neither verifies persistence nor authorizes consumers, replays history, or deduplicates.
 * Payloads retain their decoded values and are shared read-only, without serialization or cloning.
 */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  readonly publish: (
    batch: Batch,
  ) => Effect.Effect<void, Schema.SchemaError | WorkspaceMismatch | Closed>;
  /**
   * Registers immediately, before returning a single-consumer stream. Only subsequent batches
   * are delivered. Hold this scope while consuming; closing it interrupts pending reads.
   * Lag is terminal for this subscription; a new subscription starts at the current live boundary.
   */
  readonly subscribe: Effect.Effect<Stream.Stream<Batch, Lagged | Closed>, Closed, Scope.Scope>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/committed-events/Service",
) {}

interface Delivery {
  readonly sequence: bigint;
  readonly batch: Batch;
}

const decodeBatch = Schema.decodeEffect(Schema.toType(Batch));

/**
 * Construct one scoped bus. A workspace registry shares it across request and subscriber scopes.
 *
 * @category constructors
 */
export const make = Effect.fn("CommittedEvents.make")(function* (
  workspaceId: WorkspaceId.Id,
  options: Options = { capacity: 256 },
): Effect.fn.Return<Interface, Schema.SchemaError, Scope.Scope> {
  const id = yield* Schema.decodeEffect(WorkspaceId.Id)(workspaceId);
  const { capacity } = yield* Schema.decodeEffect(Options)(options);
  const hub = yield* PubSub.sliding<Delivery>(capacity);
  const gate = yield* Semaphore.make(1);
  let sequence = 0n;
  let closed = false;
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      closed = true;
      yield* PubSub.shutdown(hub);
    }),
  );

  const publish = Effect.fn("CommittedEvents.publish")(function* (input: Batch) {
    const batch = yield* decodeBatch(input);
    if (batch.workspaceId !== id)
      return yield* new WorkspaceMismatch({
        expectedWorkspaceId: id,
        actualWorkspaceId: batch.workspaceId,
      });
    // Own the envelope and event metadata; decoded payloads remain the producers' immutable values.
    const snapshot = Object.freeze({
      ...batch,
      events: Object.freeze(
        Array.map(batch.events, (event) =>
          Object.freeze({
            ...event,
            provenance:
              event.provenance === null ? null : Event.snapshotProvenance(event.provenance),
          }),
        ),
      ),
    });
    yield* gate.withPermits(1)(
      Effect.gen(function* () {
        if (closed) return yield* new Closed({ workspaceId: id });
        sequence += 1n;
        if (!(yield* PubSub.publish(hub, { sequence, batch: snapshot })))
          return yield* new Closed({ workspaceId: id });
      }).pipe(Effect.uninterruptible),
    );
  });

  const subscribe = gate.withPermits(1)(
    Effect.gen(function* () {
      if (closed) return yield* new Closed({ workspaceId: id });
      const subscription = yield* PubSub.subscribe(hub);
      let expected = sequence + 1n;
      let lagged = false;
      return Stream.fromEffectRepeat(
        Effect.gen(function* () {
          if (lagged) return yield* new Lagged({ workspaceId: id });
          if (closed) return yield* new Closed({ workspaceId: id });
          const delivery = yield* PubSub.take(subscription);
          if (delivery.sequence !== expected) {
            lagged = true;
            return yield* new Lagged({ workspaceId: id });
          }
          expected += 1n;
          return delivery.batch;
        }),
      );
    }).pipe(Effect.uninterruptible),
  );

  return Service.of({ workspaceId: id, publish, subscribe });
});

/**
 * Provide one bus whose lifetime is the layer scope.
 *
 * @category layers
 */
export const layer = (workspaceId: WorkspaceId.Id, options?: Options) =>
  Layer.effect(Service, make(workspaceId, options));

export * as CommittedEvents from "./committed-events.ts";

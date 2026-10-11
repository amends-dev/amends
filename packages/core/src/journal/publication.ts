import { Context, Crypto, DateTime, Effect, Option, Schema } from "effect";
import * as Actor from "../identity/actor.ts";
import * as Performer from "../identity/performer.ts";
import type * as WorkspaceId from "../workspace/id.ts";
import * as Event from "./event.ts";

/**
 * Trusted attribution for the current operation. Supply it around an effect, never in a
 * shared application layer. Journal.publish reads it on each call; replay does not need it.
 * There is intentionally no default performer or correlation.
 * @effect-leakable-service
 */
export class Publication extends Context.Service<Publication, Event.Provenance>()(
  "@amends-dev/core/journal/publication/Service",
) {}

/**
 * Create root attribution once per trusted application operation. Reuse it for sibling
 * facts through Publication.Publication. A correlation ID is not an idempotency key.
 * @category constructors
 */
export const make = Effect.fn("Publication.make")(function* (
  workspaceId: WorkspaceId.Id,
  performedBy: Performer.Reference,
  occurredAt?: DateTime.Utc,
) {
  const crypto = yield* Crypto.Crypto;
  return Event.snapshotProvenance(
    yield* Schema.decodeEffect(Schema.toType(Event.Provenance))({
      workspaceId,
      performedBy,
      causedBy: null,
      correlationId: Event.CorrelationId.make(yield* crypto.randomUUIDv4),
      occurredAt: occurredAt ?? (yield* DateTime.now),
    }),
  );
});

/** Resolve the performer at operation time, never when constructing a service. @category constructors */
export const makeForActor = Effect.fn("Publication.makeForActor")(function* (
  occurredAt?: DateTime.Utc,
) {
  const actor = yield* Actor.Actor;
  return yield* make(
    actor.workspaceId,
    Performer.Reference.cases.Member.make({ memberId: actor.memberId, identity: actor.identity }),
    occurredAt,
  );
});

/** Continue a causal workflow, optionally with a different performer or occurrence time. @category constructors */
export const makeCausedBy = Effect.fn("Publication.makeCausedBy")(function* (
  event: Event.Record,
  performedBy: Performer.Reference = event.provenance.performedBy,
  occurredAt?: DateTime.Utc,
) {
  return Event.snapshotProvenance(
    yield* Schema.decodeEffect(Schema.toType(Event.Provenance))({
      workspaceId: event.provenance.workspaceId,
      performedBy,
      causedBy: Event.makeReference(event),
      correlationId: event.provenance.correlationId,
      occurredAt: occurredAt ?? (yield* DateTime.now),
    }),
  );
});

/** Establish an actor's root context when absent; nested operations reuse the current context. */
export const withActor = Effect.fn("Publication.withActor")(function* <A, E, R>(
  program: Effect.Effect<A, E, R>,
) {
  const current = yield* Effect.serviceOption(Publication);
  const provenance = Option.isSome(current) ? current.value : yield* makeForActor();
  return yield* Effect.provideService(program, Publication, provenance);
});

/** Override only this effect's immediate cause and correlation, retaining its current performer. */
export const withCause = (event: Event.Record, occurredAt?: DateTime.Utc) =>
  Effect.fn("Publication.withCause")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Publication;
    const provenance = yield* Schema.decodeEffect(Schema.toType(Event.Provenance))({
      workspaceId: current.workspaceId,
      performedBy: current.performedBy,
      causedBy: Event.makeReference(event),
      correlationId: event.provenance.correlationId,
      occurredAt: occurredAt ?? (yield* DateTime.now),
    });
    return yield* Effect.provideService(program, Publication, Event.snapshotProvenance(provenance));
  });

/** Override the performer for one trusted operation without changing its causal history. */
export const withPerformer = (performedBy: Performer.Reference) =>
  Effect.fn("Publication.withPerformer")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Publication;
    const provenance = yield* Schema.decodeEffect(Schema.toType(Event.Provenance))(
      Object.assign({}, current, { performedBy }),
    );
    return yield* Effect.provideService(program, Publication, Event.snapshotProvenance(provenance));
  });

/** Use the domain action's timestamp for one publication or a block of related publications. */
export const withOccurredAt = (occurredAt: DateTime.Utc) =>
  Effect.fn("Publication.withOccurredAt")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Publication;
    const provenance = yield* Schema.decodeEffect(Schema.toType(Event.Provenance))(
      Object.assign({}, current, { occurredAt }),
    );
    return yield* Effect.provideService(program, Publication, Event.snapshotProvenance(provenance));
  });

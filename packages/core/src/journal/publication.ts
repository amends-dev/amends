import { Crypto, DateTime, Effect, Schema } from "effect";
import { Actor } from "../identity/actor.ts";
import { Performer } from "../identity/performer.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { Event } from "./event.ts";

/**
 * Create root attribution once per trusted application operation. Reuse it for sibling
 * facts; pass it explicitly to Journal.publish. A correlation ID is not an idempotency key.
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
  const actor = yield* Actor.Service;
  return yield* make(
    actor.workspaceId,
    Performer.Reference.cases.Member.make({ memberId: actor.memberId, identity: actor.identity }),
    occurredAt,
  );
});

/** Continue a causal workflow, optionally with a different performer or occurrence time. @category constructors */
export const makeCausedBy = Effect.fn("Publication.makeCausedBy")(function* (
  event: Event.Record & { readonly provenance: Event.Provenance },
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

export * as Publication from "./publication.ts";

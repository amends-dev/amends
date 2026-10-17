/**
 * Who publishes, why, and when: the provenance every `Journal.publish` stamps on its fact.
 * `Publication.Publication` holds it around one operation's effect, never in a shared layer, and
 * the journal reads it on each publication; replay needs none. `withActor` establishes it for an
 * actor's operation, which nested operations reuse; `make` builds it for an authenticated
 * identity before membership exists, or for a system process; and `withCause`, `withPerformer`,
 * and `withOccurredAt` change it for one enclosed effect.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Actor from "../identity/Actor.ts"
import * as Performer from "../identity/Performer.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Event from "./Event.ts"

/**
 * Trusted attribution for the current operation, as `Event.Provenance`. Supply it around an
 * effect, never in a shared application layer. `Journal.publish` reads it on each call; replay
 * does not need it. There is intentionally no default performer or correlation.
 *
 * @effect-leakable-service
 * @category services
 * @since 0.1.0
 */
export class Publication extends Context.Service<Publication, Event.Provenance>()(
  "@amends-dev/core/journal/Publication"
) {}

/**
 * Root attribution for `performedBy` in `workspaceId`: no cause, a fresh correlation ID, and
 * `occurredAt` or now. Create it once per trusted application operation, such as bootstrap or
 * accepting an invitation, and reuse it for sibling facts through `Publication.Publication`. A
 * correlation ID is not an idempotency key.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fnUntraced(function* (
  workspaceId: WorkspaceId.WorkspaceId,
  performedBy: Performer.Reference,
  occurredAt?: DateTime.Utc
) {
  const crypto = yield* Crypto.Crypto
  return Event.snapshotProvenance(
    yield* Schema.decodeEffect(Schema.toType(Event.Provenance))({
      workspaceId,
      performedBy,
      causedBy: null,
      correlationId: Event.CorrelationId.make(yield* crypto.randomUUIDv4()),
      occurredAt: occurredAt ?? (yield* DateTime.now)
    })
  )
})

/**
 * Root attribution for the current `Actor.Actor`, as the member performing the operation. Resolve
 * the performer at operation time, never when constructing a service.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeForActor = Effect.fnUntraced(function* (occurredAt?: DateTime.Utc) {
  const actor = yield* Actor.Actor
  return yield* make(
    actor.workspaceId,
    Performer.Reference.cases.Member.make({ memberId: actor.memberId, identity: actor.identity }),
    occurredAt
  )
})

/**
 * Continue a causal workflow from `event`: its workspace and correlation, with `event` as the
 * cause, its performer unless another is given, and `occurredAt` or now. `withCause` keeps the
 * current operation's performer instead.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeCausedBy = Effect.fnUntraced(function* (
  event: Event.Event,
  performedBy: Performer.Reference = event.provenance.performedBy,
  occurredAt?: DateTime.Utc
) {
  return Event.snapshotProvenance(
    yield* Schema.decodeEffect(Schema.toType(Event.Provenance))({
      workspaceId: event.provenance.workspaceId,
      performedBy,
      causedBy: Event.makeReference(event),
      correlationId: event.provenance.correlationId,
      occurredAt: occurredAt ?? (yield* DateTime.now)
    })
  )
})

/**
 * Runs `program` with the current attribution, or, when there is none, with root attribution for
 * the current actor from `makeForActor`; nested operations reuse the current context.
 *
 * @category providing services
 * @since 0.1.0
 */
export const withActor = Effect.fn("Publication.withActor")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
  const current = yield* Effect.serviceOption(Publication)
  const provenance = Option.isSome(current) ? current.value : yield* makeForActor()
  return yield* Effect.provideService(program, Publication, provenance)
})

/**
 * Override only this effect's immediate cause and correlation, retaining its current performer and
 * workspace: `event` becomes the cause, its correlation is carried on, and the occurrence time is
 * `occurredAt` or now.
 *
 * @category providing services
 * @since 0.1.0
 */
export const withCause = (event: Event.Event, occurredAt?: DateTime.Utc) =>
  Effect.fn("Publication.withCause")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Publication
    const provenance = yield* Schema.decodeEffect(Schema.toType(Event.Provenance))({
      workspaceId: current.workspaceId,
      performedBy: current.performedBy,
      causedBy: Event.makeReference(event),
      correlationId: event.provenance.correlationId,
      occurredAt: occurredAt ?? (yield* DateTime.now)
    })
    return yield* Effect.provideService(program, Publication, Event.snapshotProvenance(provenance))
  })

/**
 * Override the performer for one trusted operation without changing its causal history.
 *
 * @category providing services
 * @since 0.1.0
 */
export const withPerformer = (performedBy: Performer.Reference) =>
  Effect.fn("Publication.withPerformer")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Publication
    const provenance = yield* Schema.decodeEffect(Schema.toType(Event.Provenance))(
      Object.assign({}, current, { performedBy })
    )
    return yield* Effect.provideService(program, Publication, Event.snapshotProvenance(provenance))
  })

/**
 * Use the domain action's timestamp for one publication or a block of related publications.
 *
 * @category providing services
 * @since 0.1.0
 */
export const withOccurredAt = (occurredAt: DateTime.Utc) =>
  Effect.fn("Publication.withOccurredAt")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Publication
    const provenance = yield* Schema.decodeEffect(Schema.toType(Event.Provenance))(
      Object.assign({}, current, { occurredAt })
    )
    return yield* Effect.provideService(program, Publication, Event.snapshotProvenance(provenance))
  })

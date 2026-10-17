/**
 * Keeps the invitation read model, `InvitationStore`: each invitation as issued, and the state it
 * settled into.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Projection from "../journal/Projection.ts"
import * as Invitation from "./Invitation.ts"
import * as InvitationFacts from "./InvitationFacts.ts"
import * as InvitationStore from "./InvitationStore.ts"

/**
 * Inserts each issued invitation as pending, and settles it as accepted or revoked on those facts.
 * Replay applies the recorded outcomes; it never evaluates the current time or the inviter's
 * authority.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("workspace.invitations", { version: 1 })
  .on(
    InvitationFacts.Issued,
    Effect.fn("InvitationProjection.issued")(function* ({ payload }) {
      yield* (yield* InvitationStore.InvitationStore).insert({
        details: payload,
        state: Invitation.State.cases.Pending.make({})
      })
    })
  )
  .on(
    InvitationFacts.Accepted,
    Effect.fn("InvitationProjection.accepted")(function* ({ payload }) {
      yield* (yield* InvitationStore.InvitationStore).settle(
        payload.invitationId,
        Invitation.State.cases.Accepted.make({ memberId: payload.memberId, acceptedAt: payload.acceptedAt })
      )
    })
  )
  .on(
    InvitationFacts.Revoked,
    Effect.fn("InvitationProjection.revoked")(function* ({ payload }) {
      yield* (yield* InvitationStore.InvitationStore).settle(
        payload.invitationId,
        Invitation.State.cases.Revoked.make({ revokedBy: payload.revokedBy, revokedAt: payload.revokedAt })
      )
    })
  )

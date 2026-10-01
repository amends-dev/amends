import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";

import { InvitationFacts } from "./facts.ts";
import { InvitationStore } from "./store.ts";

/** Replay uses recorded intent/outcomes; it never evaluates current time or authority. */
export const definition = Projection.make("workspace.invitations", { version: 1 })
  .on(
    InvitationFacts.Issued,
    Effect.fn("InvitationProjection.issued")(function* ({ payload }) {
      yield* (yield* InvitationStore.Service).insert({
        details: payload,
        state: { _tag: "Pending" },
      });
    }),
  )
  .on(
    InvitationFacts.Accepted,
    Effect.fn("InvitationProjection.accepted")(function* ({ payload }) {
      yield* (yield* InvitationStore.Service).settle(payload.invitationId, {
        _tag: "Accepted",
        memberId: payload.memberId,
        acceptedAt: payload.acceptedAt,
      });
    }),
  )
  .on(
    InvitationFacts.Revoked,
    Effect.fn("InvitationProjection.revoked")(function* ({ payload }) {
      yield* (yield* InvitationStore.Service).settle(payload.invitationId, {
        _tag: "Revoked",
        revokedBy: payload.revokedBy,
        revokedAt: payload.revokedAt,
      });
    }),
  );

export * as InvitationProjection from "./projection.ts";

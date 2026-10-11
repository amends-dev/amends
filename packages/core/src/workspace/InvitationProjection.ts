import { Effect } from "effect";
import * as Projection from "../journal/Projection.ts";

import * as InvitationFacts from "./InvitationFacts.ts";
import * as InvitationStore from "./InvitationStore.ts";

/** Replay uses recorded intent/outcomes; it never evaluates current time or authority. */
export const definition = Projection.make("workspace.invitations", { version: 1 })
  .on(
    InvitationFacts.Issued,
    Effect.fn("InvitationProjection.issued")(function* ({ payload }) {
      yield* (yield* InvitationStore.InvitationStore).insert({
        details: payload,
        state: { _tag: "Pending" },
      });
    }),
  )
  .on(
    InvitationFacts.Accepted,
    Effect.fn("InvitationProjection.accepted")(function* ({ payload }) {
      yield* (yield* InvitationStore.InvitationStore).settle(payload.invitationId, {
        _tag: "Accepted",
        memberId: payload.memberId,
        acceptedAt: payload.acceptedAt,
      });
    }),
  )
  .on(
    InvitationFacts.Revoked,
    Effect.fn("InvitationProjection.revoked")(function* ({ payload }) {
      yield* (yield* InvitationStore.InvitationStore).settle(payload.invitationId, {
        _tag: "Revoked",
        revokedBy: payload.revokedBy,
        revokedAt: payload.revokedAt,
      });
    }),
  );

import { Effect, Schema } from "effect";
import { Fact } from "../journal/fact.ts";
import { Projection } from "../journal/projection.ts";
import { Invitation } from "./invitation.ts";
import { InvitationStore } from "./invitation-store.ts";
import { Workspace } from "./workspace.ts";

export const Issued = Fact.make("workspace.invitation.issued", {
  version: 1,
  payload: Invitation.Details,
});
export const Accepted = Fact.make("workspace.invitation.accepted", {
  version: 1,
  payload: Schema.Struct({
    workspaceId: Workspace.Id,
    invitationId: Invitation.Id,
    ...Invitation.State.cases.Accepted.fields,
  }),
});
export const Revoked = Fact.make("workspace.invitation.revoked", {
  version: 1,
  payload: Schema.Struct({
    workspaceId: Workspace.Id,
    invitationId: Invitation.Id,
    ...Invitation.State.cases.Revoked.fields,
  }),
});

const storeFor = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  const store = yield* InvitationStore.Service;
  if (store.workspaceId !== workspaceId)
    return yield* new InvitationStore.Conflict({
      operation: "project",
      message: "Fact belongs to another workspace",
    });
  return store;
});

/** Replay uses recorded intent/outcomes; it never evaluates current time or authority. */
export const projection = Projection.make("workspace.invitations", { version: 1 })
  .on(
    Issued,
    Effect.fn("InvitationProjection.issued")(function* ({ payload }) {
      yield* (yield* storeFor(payload.workspaceId)).insert({
        details: payload,
        state: { _tag: "Pending" },
      });
    }),
  )
  .on(
    Accepted,
    Effect.fn("InvitationProjection.accepted")(function* ({ payload }) {
      yield* (yield* storeFor(payload.workspaceId)).settle(payload.invitationId, {
        _tag: "Accepted",
        memberId: payload.memberId,
        acceptedAt: payload.acceptedAt,
      });
    }),
  )
  .on(
    Revoked,
    Effect.fn("InvitationProjection.revoked")(function* ({ payload }) {
      yield* (yield* storeFor(payload.workspaceId)).settle(payload.invitationId, {
        _tag: "Revoked",
        revokedBy: payload.revokedBy,
        revokedAt: payload.revokedAt,
      });
    }),
  );

export * as InvitationJournal from "./invitation-journal.ts";

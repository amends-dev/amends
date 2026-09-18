import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Invitation } from "./invitation.ts";
import { Workspace } from "../workspace.ts";

export const Issued = Fact.make("workspace.invitation.issued", {
  version: 1,
  payload: Invitation.Issuance,
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

export * as InvitationFacts from "./facts.ts";

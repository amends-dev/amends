import * as Subject from "../journal/Subject.ts";
import { Schema } from "effect";
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Invitation from "./Invitation.ts";
import * as Workspace from "./Workspace.ts";

export const Issued = Fact.make("workspace.invitation.issued", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("invitation", payload.id),
  version: 1,
  payload: Invitation.Issuance,
  occurrence: (payload) => [payload.id],
});
export const Accepted = Fact.make("workspace.invitation.accepted", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("invitation", payload.invitationId),
  version: 1,
  payload: Schema.Struct({
    workspaceId: Workspace.Id,
    invitationId: Invitation.Id,
    ...Invitation.State.cases.Accepted.fields,
  }),
  occurrence: (payload) => [payload.invitationId],
});
export const Revoked = Fact.make("workspace.invitation.revoked", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("invitation", payload.invitationId),
  version: 1,
  payload: Schema.Struct({
    workspaceId: Workspace.Id,
    invitationId: Invitation.Id,
    ...Invitation.State.cases.Revoked.fields,
  }),
  occurrence: (payload) => [payload.invitationId],
});

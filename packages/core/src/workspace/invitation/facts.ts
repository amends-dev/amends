import { Subject } from "../../journal/subject.ts";
import { Schema } from "effect";
import { Audience } from "../../journal/audience.ts";
import { Fact } from "../../journal/fact.ts";
import { Invitation } from "./invitation.ts";
import { Workspace } from "../workspace.ts";

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

export * as InvitationFacts from "./facts.ts";

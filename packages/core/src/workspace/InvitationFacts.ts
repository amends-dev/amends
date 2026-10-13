/**
 * The facts recorded about invitations: one issued, accepted, or revoked. `InvitationProjection`
 * keeps `InvitationStore` from them. `InvitationService` publishes them, and `MemberService.remove`
 * publishes a revocation for each pending invitation of the person it removes.
 *
 * @since 0.1.0
 */
import * as Subject from "../journal/Subject.ts";
import * as Schema from "effect/Schema";
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Invitation from "./Invitation.ts";
import * as Workspace from "./Workspace.ts";

/**
 * An invitation was issued, as its issuance says. Every member may learn of it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Issued = Fact.make("workspace.invitation.issued", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("invitation", payload.id),
  version: 1,
  payload: Invitation.Issuance,
  occurrence: (payload) => [payload.id],
});

/**
 * The invitation was accepted: its recipient became the member it names, when it says. The same
 * commit adds that member, assigns their role, and admits them to the general group.
 *
 * @category facts
 * @since 0.1.0
 */
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

/**
 * The invitation was revoked, by which member and when: by `InvitationService.revoke`, or by the
 * removal of the person it names, which revokes each of their pending invitations.
 *
 * @category facts
 * @since 0.1.0
 */
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

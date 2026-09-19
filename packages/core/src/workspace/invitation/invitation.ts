import { DateTime, Schema } from "effect";
import { Role } from "../../authorization/role/role.ts";
import { Identity } from "../../identity/identity.ts";
import { Member } from "../member/member.ts";
import { Workspace } from "../workspace.ts";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceInvitationId"));
export type Id = typeof Id.Type;

export const IssueInput = Schema.Struct({
  recipientId: Identity.HumanId,
  roleId: Role.Id,
  expiresAt: Schema.DateTimeUtcFromString,
}).annotate({ identifier: "WorkspaceInvitationIssueInput" });
export interface IssueInput extends Schema.Schema.Type<typeof IssueInput> {}

/** Immutable issuance record; acceptance assigns the referenced role at workspace scope. */
export const Issuance = Schema.Struct({
  ...IssueInput.fields,
  id: Id,
  workspaceId: Workspace.Id,
  inviterMemberId: Member.Id,
  issuedAt: Schema.DateTimeUtcFromString,
})
  .check(
    Schema.makeFilter((value) => {
      if (!DateTime.isGreaterThan(value.expiresAt, value.issuedAt))
        return "Expiry must follow issuance";
      return undefined;
    }),
  )
  .annotate({ identifier: "WorkspaceInvitationIssuance" });
export interface Issuance extends Schema.Schema.Type<typeof Issuance> {}

export const State = Schema.TaggedUnion({
  Pending: {},
  Accepted: { memberId: Member.Id, acceptedAt: Schema.DateTimeUtcFromString },
  Revoked: { revokedBy: Member.Id, revokedAt: Schema.DateTimeUtcFromString },
});
export type State = typeof State.Type;

/** Expiry is evaluated against the clock; it needs no scheduled status update. */
export const Record = Schema.Struct({ details: Issuance, state: State }).annotate({
  identifier: "WorkspaceInvitation",
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Invitation from "./invitation.ts";

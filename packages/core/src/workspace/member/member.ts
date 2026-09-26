import { Schema } from "effect";
import { Audience } from "../../journal/audience.ts";
import { Identity } from "../../identity/identity.ts";
import { WorkspaceId } from "../id.ts";
import { MemberId } from "./id.ts";

/** Identifies one admission to a workspace; rejoining creates a new membership. */
export const Id = MemberId.Id;
export type Id = MemberId.Id;

export const Status = Schema.Literals(["active", "removed"]);
export type Status = typeof Status.Type;

/** What people in a workspace call a member: without surrounding space, 1 to 80 characters. */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(80)).annotate({
  identifier: "MemberName",
});
export type Name = typeof Name.Type;

/**
 * Removed memberships retain their identity for historical references. A name is what the member
 * chose to be called in this workspace; without one, clients show their identity.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  identity: Identity.MemberReference,
  name: Schema.optionalKey(Name),
  status: Status,
}).annotate({ identifier: "WorkspaceMember" });
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** One workspace membership alone. */
export const audienceOf = (memberId: Id): Audience.Scope => Audience.make("member", memberId);

export * as Member from "./member.ts";

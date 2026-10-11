import { Schema } from "effect";
import * as Audience from "../../journal/audience.ts";
import * as Identity from "../../identity/identity.ts";
import * as WorkspaceId from "../id.ts";
import * as MemberId from "./id.ts";
import * as Text from "../../text/text.ts";

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
/** A name a member chooses now: a `Name` without hidden characters. */
export const NewName = Name.check(Text.isName);

/**
 * Removed memberships retain their identity for historical references. A name is what the member
 * is called in this workspace: what a person chose on joining, or an agent's name.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  identity: Identity.MemberReference,
  name: Name,
  status: Status,
}).annotate({ identifier: "WorkspaceMember" });
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** One workspace membership alone. */
export const audienceOf = (memberId: Id): Audience.Scope => Audience.make("member", memberId);

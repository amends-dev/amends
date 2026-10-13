/**
 * The facts recorded about memberships: a member added, renamed, and removed. `MemberProjection`
 * keeps `MemberStore` from them. Initialization adds the creator, `MemberCommand.add` adds everyone
 * else, and `MemberService` renames and removes.
 *
 * @since 0.1.0
 */
import * as Subject from "../journal/Subject.ts";
import * as Schema from "effect/Schema";
import * as Identity from "../identity/Identity.ts";
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Member from "./Member.ts";
import * as Workspace from "./Workspace.ts";

/**
 * A member joined: an active membership with a fresh member ID, for the identity and under the name
 * recorded. Every member may learn of it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Added = Fact.make("workspace.member.added", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
    /** What the member is called on joining; later facts may rename them. */
    name: Member.Name,
  }),
  occurrence: (payload) => [payload.memberId],
});

/**
 * A member chose what people in the workspace call them; each change is its own fact.
 *
 * @category facts
 * @since 0.1.0
 */
export const Renamed = Fact.make("workspace.member.renamed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
    name: Member.Name,
  }),
});

/**
 * A member was removed. Removal is terminal for this membership, whose record stays; rejoining is
 * a new `Added` with a new ID. The same commit records the member's group departures and, for a
 * person, the revocation of their pending invitations, each caused by this fact.
 *
 * @category facts
 * @since 0.1.0
 */
export const Removed = Fact.make("workspace.member.removed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
  }),
  occurrence: (payload) => [payload.memberId],
});

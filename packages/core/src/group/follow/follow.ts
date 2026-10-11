import { Schema } from "effect";
import * as GroupId from "../id.ts";
import * as GroupMembership from "../membership/membership.ts";
import * as MemberId from "../../workspace/member/id.ts";
import * as WorkspaceId from "../../workspace/id.ts";

/** Identifies one period of following; following again after unfollowing uses a fresh ID. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("GroupFollowId"));

export type Id = typeof Id.Type;

export const Status = Schema.Literals(["active", "ended"]);

export type Status = typeof Status.Type;

/**
 * A member following a team group, so that threads started there afterwards admit them. It
 * belongs to the member's group admission and ends with it.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  memberId: MemberId.Id,
  groupMembershipId: GroupMembership.Id,
  followedAt: Schema.DateTimeUtcFromString,
  status: Status,
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});

export interface Record extends Schema.Schema.Type<typeof Record> {}

/** Follow or unfollow a team group for oneself, or for an agent member one may use. */
export const Input = Schema.Struct({
  groupId: GroupId.Id,
  memberId: MemberId.Id,
});

export interface Input extends Schema.Schema.Type<typeof Input> {}

/** Ends exactly one follow; the journal envelope records when. */
export const Ending = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  followId: Id,
  memberId: MemberId.Id,
});

export interface Ending extends Schema.Schema.Type<typeof Ending> {}

import { Schema } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { Group } from "../group.ts";

/** The outcomes `GroupFollowApplication` reports that a caller can act on; schemas only, for contracts. */
/** Only an agent can be made to follow by another member; people follow for themselves. */
export class AgentRequired extends Schema.TaggedError<AgentRequired>()(
  "GroupFollowApplication.AgentRequired",
  { memberId: Member.Id },
) {}
/** Missing, foreign, and groups the actor does not belong to share this outcome. */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "GroupFollowApplication.GroupNotFound",
  { groupId: Group.Id },
) {}
/** The named member is missing, inactive, or not a current member of the group. */
export class MemberUnavailable extends Schema.TaggedError<MemberUnavailable>()(
  "GroupFollowApplication.MemberUnavailable",
  { memberId: Member.Id },
) {}
/** A direct group's members already take part in all of its threads. */
export class NotFollowable extends Schema.TaggedError<NotFollowable>()(
  "GroupFollowApplication.NotFollowable",
  { groupId: Group.Id },
) {}

export * as GroupFollowErrors from "./errors.ts";

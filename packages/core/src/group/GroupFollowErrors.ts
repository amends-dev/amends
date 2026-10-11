import { Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Group from "./Group.ts";

/** The outcomes `GroupFollowService` reports that a caller can act on; schemas only, for contracts. */
/** Only an agent can be made to follow by another member; people follow for themselves. */
export class AgentRequired extends Schema.TaggedError<AgentRequired>()(
  "GroupFollowService.AgentRequired",
  { memberId: Member.Id },
) {}

/** Missing, foreign, and groups the actor does not belong to share this outcome. */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "GroupFollowService.GroupNotFound",
  { groupId: Group.Id },
) {}

/** The named member is missing, inactive, or not a current member of the group. */
export class MemberUnavailable extends Schema.TaggedError<MemberUnavailable>()(
  "GroupFollowService.MemberUnavailable",
  { memberId: Member.Id },
) {}

/** A direct group's members already take part in all of its threads. */
export class NotFollowable extends Schema.TaggedError<NotFollowable>()(
  "GroupFollowService.NotFollowable",
  { groupId: Group.Id },
) {}

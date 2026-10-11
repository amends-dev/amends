/**
 * The outcomes `GroupFollowService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Group from "./Group.ts";

/**
 * Only an agent can be made to follow by another member; people follow for themselves.
 *
 * @category errors
 * @since 0.1.0
 */
export class AgentRequired extends Schema.TaggedError<AgentRequired>()(
  "GroupFollowService.AgentRequired",
  { memberId: Member.Id },
) {}

/**
 * Missing, foreign, and groups the actor does not belong to share this outcome.
 *
 * @category errors
 * @since 0.1.0
 */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "GroupFollowService.GroupNotFound",
  { groupId: Group.Id },
) {}

/**
 * The named member is missing, inactive, or not a current member of the group.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemberUnavailable extends Schema.TaggedError<MemberUnavailable>()(
  "GroupFollowService.MemberUnavailable",
  { memberId: Member.Id },
) {}

/**
 * A direct group's members already take part in all of its threads.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFollowable extends Schema.TaggedError<NotFollowable>()(
  "GroupFollowService.NotFollowable",
  { groupId: Group.Id },
) {}

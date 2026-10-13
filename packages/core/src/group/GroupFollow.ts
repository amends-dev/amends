/**
 * A group follow is a member's standing wish to take part in a team group's new threads: threads
 * started there afterwards admit them from their first message. It is held through the member's
 * admission to the group and ends with it, or when they unfollow. This module holds its record and
 * the input of the operations on it; `GroupFollowService` is those operations, and
 * `ThreadQuery.followers` reads a group's followers when a thread starts there.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as GroupId from "./GroupId.ts"
import * as GroupMembership from "./GroupMembership.ts"

/**
 * Identifies one period of following; following again after unfollowing uses a fresh ID.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("GroupFollowId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type

/**
 * Whether the follow is current or has ended.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["active", "ended"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type

/**
 * A member following a team group, so that threads started there afterwards admit them. It
 * belongs to the member's group admission and ends with it. What `GroupFollowFacts.Started`
 * records and `GroupFollowStore` keeps.
 *
 * @category schemas
 * @since 0.1.0
 */
export const GroupFollow = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  memberId: MemberId.Id,
  /** The admission the follow is held through; it ends when the admission does. */
  groupMembershipId: GroupMembership.Id,
  followedAt: Schema.DateTimeUtcFromString,
  status: Status,
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface GroupFollow extends Schema.Schema.Type<typeof GroupFollow> {}

/**
 * Follow or unfollow a team group for oneself, or for an agent member one may use.
 *
 * @category options
 * @since 0.1.0
 */
export const Input = Schema.Struct({
  groupId: GroupId.Id,
  memberId: MemberId.Id
})

/**
 * @category options
 * @since 0.1.0
 */
export interface Input extends Schema.Schema.Type<typeof Input> {}

/**
 * Ends exactly one follow; the journal envelope records when. What `GroupFollowFacts.Ended`
 * records.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Ending = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  followId: Id,
  memberId: MemberId.Id
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Ending extends Schema.Schema.Type<typeof Ending> {}

/**
 * A group follow is a member's standing wish to take part in a team group's new threads: threads
 * started there afterwards admit them from their first message. It is held through the member's
 * admission to the group and ends with it, or when they unfollow. This module holds its record and
 * the input of the operations on it; `GroupFollowService` is those operations, and
 * `ThreadQuery.followers` reads a group's followers when a thread starts there.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Request from "../request/Request.ts"
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
export const GroupFollowId = Schema.NonEmptyString.pipe(Schema.brand("GroupFollowId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type GroupFollowId = typeof GroupFollowId.Type

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
  id: GroupFollowId,
  workspaceId: WorkspaceId.WorkspaceId,
  groupId: GroupId.GroupId,
  memberId: MemberId.MemberId,
  /** The admission the follow is held through; it ends when the admission does. */
  groupMembershipId: GroupMembership.GroupMembershipId,
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
  groupId: GroupId.GroupId,
  memberId: MemberId.MemberId
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
  workspaceId: WorkspaceId.WorkspaceId,
  groupId: GroupId.GroupId,
  followId: GroupFollowId,
  memberId: MemberId.MemberId
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Ending extends Schema.Schema.Type<typeof Ending> {}

/**
 * The ID of the follow the current request starts for `memberId` in a group, as `Request.newId`
 * derives it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const newId = (groupId: GroupId.GroupId, memberId: MemberId.MemberId) =>
  Effect.map(Request.newId("group-follow", [groupId, memberId]), (id) => GroupFollowId.make(id))

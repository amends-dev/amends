/**
 * The facts recorded about follows: one started, and one ended by unfollowing.
 * `GroupFollowProjection` keeps `GroupFollowStore` from them, and ends a follow with its admission
 * on `GroupMembershipFacts.Removed`, without a fact of its own.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as Member from "../workspace/Member.ts"
import * as GroupFollow from "./GroupFollow.ts"

/**
 * A member started following a group, as the follow says. Following is personal: only the
 * follower learns of it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Started = Fact.make("group.follow.started", {
  audience: (payload) => [Member.audienceOf(payload.memberId)],
  version: 1,
  subject: (payload) => Subject.make("group-follow", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct({
    ...GroupFollow.GroupFollow.fields,
    status: Schema.Literal("active"),
    endedAt: Schema.Null
  })
})

/**
 * Ends one follow by its ID. Leaving the group ends its follow without this fact.
 *
 * @category facts
 * @since 0.1.0
 */
export const Ended = Fact.make("group.follow.ended", {
  audience: (payload) => [Member.audienceOf(payload.memberId)],
  version: 1,
  subject: (payload) => Subject.make("group-follow", payload.followId),
  occurrence: (payload) => [payload.followId],
  payload: GroupFollow.Ending
})

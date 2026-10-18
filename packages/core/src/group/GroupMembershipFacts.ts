/**
 * The facts recorded about admissions: a member added to a group, and an admission ended.
 * `GroupMembershipProjection` keeps `GroupMembershipStore` from them. On an ending, the follow and
 * participation projections end what was held through the admission, and the notification
 * projection settles what the member had pending from the group.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as GroupMembership from "./GroupMembership.ts"

/**
 * A member was admitted to a group, as the admission says. The group's members learn who joined,
 * and so does the joining member.
 *
 * @category facts
 * @since 0.1.0
 */
export const Added = Fact.make("group.membership.added", {
  version: 1,
  subject: (payload) => Subject.make("group-membership", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct({
    ...GroupMembership.GroupMembership.fields,
    status: Schema.Literal("active")
  })
})

/**
 * An admission ended, for the reason the removal says. Ends exactly one admission; rejoining
 * records `Added` with a fresh ID.
 *
 * @category facts
 * @since 0.1.0
 */
export const Removed = Fact.make("group.membership.removed", {
  version: 1,
  subject: (payload) => Subject.make("group-membership", payload.membershipId),
  occurrence: (payload) => [payload.membershipId],
  payload: GroupMembership.Removal
})

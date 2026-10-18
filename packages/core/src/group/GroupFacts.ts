/**
 * The facts recorded about a group itself: its creation and its renames. Admissions and follows
 * have facts of their own, in `GroupMembershipFacts` and `GroupFollowFacts`. `GroupProjection`
 * keeps `GroupStore` from these.
 *
 * @since 0.1.0
 */

import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as Group from "./Group.ts"

/**
 * A group was created, as its record says.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("group.created", {
  version: 1,
  subject: (payload) => Subject.make("group", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Group.Group
})

/**
 * A team group's name changed; each rename is its own fact, which the group's members may learn
 * of.
 *
 * @category facts
 * @since 0.1.0
 */
export const Renamed = Fact.make("group.renamed", {
  version: 1,
  subject: (payload) => Subject.make("group", payload.groupId),
  payload: Group.Renamed
})

/**
 * Keeps the group read model, `GroupStore`: each group as it was created and since renamed, and
 * its latest activity, by which a reader's groups are shown as unread.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Projection from "../journal/Projection.ts"
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts"
import * as GroupFacts from "./GroupFacts.ts"
import * as GroupStore from "./GroupStore.ts"

/**
 * Inserts each created group, sets the name of each renamed one, and advances a group's latest
 * activity on each activity in any of its threads of a kind that counts as new, such as a message;
 * quiet kinds leave it as it is.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("groups", { version: 1 })
  .on(
    GroupFacts.Created,
    Effect.fn("GroupProjection.created")(function* ({ payload }) {
      const groupStore = yield* GroupStore.GroupStore
      yield* groupStore.insert(payload)
    })
  )
  .on(
    GroupFacts.Renamed,
    Effect.fn("GroupProjection.renamed")(function* ({ payload }) {
      const groupStore = yield* GroupStore.GroupStore
      yield* groupStore.rename(payload)
    })
  )
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("GroupProjection.activity")(function* ({ payload: { groupId, activity } }) {
      const groupStore = yield* GroupStore.GroupStore
      // A group's latest activity is the latest activity of a kind that counts as new, such as a
      // message, in any of its threads.
      if (!activity.newActivity) return
      yield* groupStore.recordLatest({ groupId, occurredAt: activity.occurredAt })
    })
  )

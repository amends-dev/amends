/**
 * The one fact every kind of activity is recorded with. The activity, thread, group, and
 * notification projections each read it into their own store, so adding a kind of activity adds
 * no fact.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as ThreadActivity from "./ThreadActivity.ts"

/**
 * An activity was recorded at its position in a thread, with the recipients it selected, each
 * once, and the thread's group, whose members may read the activity; each recipient is notified
 * from it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Recorded = Fact.make("thread.activity.recorded", {
  version: 1,
  subject: (payload) => Subject.make("thread-activity", payload.activity.id),
  occurrence: (payload) => [payload.activity.id],
  payload: Schema.Struct({
    groupId: GroupId.GroupId,
    activity: ThreadActivity.ThreadActivity,
    recipients: Schema.Array(ThreadActivity.Recipient).check(
      Schema.makeFilter(
        (values) =>
          new Set(values.map((value) => value.participationId)).size === values.length ||
          "Duplicate activity recipients"
      )
    )
  })
})

/**
 * The one fact every kind of activity is recorded with. The activity, thread, group, and
 * notification projections each read it into their own store, so adding a kind of activity adds
 * no fact.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Fact from "../journal/fact.ts";
import * as Subject from "../journal/subject.ts";
import * as Group from "../group/group.ts";
import * as GroupId from "../group/id.ts";
import * as ThreadActivity from "./ThreadActivity.ts";

/**
 * An activity was recorded at its position in a thread, with the recipients it selected, each
 * once. The thread's group is on the payload because an audience is derived from the payload
 * alone; its members may read the activity, and each recipient is notified from it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Recorded = Fact.make("thread.activity.recorded", {
  version: 1,
  subject: (payload) => Subject.make("thread-activity", payload.activity.id),
  occurrence: (payload) => [payload.activity.id],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Schema.Struct({
    groupId: GroupId.Id,
    activity: ThreadActivity.Record,
    recipients: Schema.Array(ThreadActivity.Recipient).check(
      Schema.makeFilter(
        (values) =>
          new Set(values.map((value) => value.participationId)).size === values.length ||
          "Duplicate activity recipients",
      ),
    ),
  }),
});

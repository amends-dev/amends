import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Subject } from "../../journal/subject.ts";
import { Group } from "../../group/group.ts";
import { GroupId } from "../../group/id.ts";
import { ThreadActivity } from "./activity.ts";
/** The activity with its thread's group, whose members may read it. */
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
export * as ThreadActivityFacts from "./facts.ts";

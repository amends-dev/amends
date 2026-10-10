/**
 * The facts recorded about messages. A message's position in its thread is recorded apart, as
 * activity, by `ThreadActivityFacts.Recorded`.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Group } from "../group/group.ts";
import { GroupId } from "../group/id.ts";
import { ThreadMessage } from "./ThreadMessage.ts";

/**
 * A message was published, as its record says, with its thread's group, whose members may read
 * it. The group is on the payload because an audience is derived from the payload alone.
 *
 * @category facts
 * @since 0.1.0
 */
export const Published = Fact.make("thread.message.published", {
  version: 1,
  subject: (payload) => Subject.make("thread-message", payload.id),
  occurrence: (payload) => [payload.id],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Schema.Struct({ ...ThreadMessage.Record.fields, groupId: GroupId.Id }),
});

export * as ThreadMessageFacts from "./ThreadMessageFacts.ts";

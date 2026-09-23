import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Subject } from "../../journal/subject.ts";
import { Group } from "../../group/group.ts";
import { GroupId } from "../../group/id.ts";
import { ThreadMessage } from "./message.ts";
/** The message with its thread's group, whose members may read it. */
export const Published = Fact.make("thread.message.published", {
  version: 1,
  subject: (payload) => Subject.make("thread-message", payload.id),
  occurrence: (payload) => [payload.id],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Schema.Struct({ ...ThreadMessage.Record.fields, groupId: GroupId.Id }),
});
export * as ThreadMessageFacts from "./facts.ts";

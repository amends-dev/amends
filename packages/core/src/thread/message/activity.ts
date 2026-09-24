import { Schema } from "effect";
import { Subject } from "../../journal/subject.ts";
import { ThreadActivityKind } from "../activity/kind.ts";
import { ThreadMessageId } from "./id.ts";

/** A message was published to the thread; it is the thread's latest activity for its readers. */
export const Published = ThreadActivityKind.make("message.published", {
  details: Schema.Struct({ messageId: ThreadMessageId.Id }),
  subject: ({ messageId }) => Subject.make("message", messageId),
  newActivity: true,
});
export type Published = ThreadActivityKind.Activity<typeof Published>;

export * as ThreadMessageActivity from "./activity.ts";

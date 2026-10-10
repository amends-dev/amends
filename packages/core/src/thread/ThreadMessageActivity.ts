/**
 * The kind of activity a message records in its thread's timeline. `ThreadMessageTimeline` shows
 * it.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { Subject } from "../journal/subject.ts";
import { ThreadActivityKind } from "./ThreadActivityKind.ts";
import { ThreadMessageId } from "./ThreadMessageId.ts";

/**
 * A message was published to the thread. It is the thread's latest activity for its readers, and
 * a message is published once, so its subject is its occurrence.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Published = ThreadActivityKind.make("message.published", {
  version: 1,
  details: Schema.Struct({ messageId: ThreadMessageId.Id }),
  subject: ({ messageId }) => Subject.make("message", messageId),
  newActivity: true,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Published = ThreadActivityKind.Activity<typeof Published>;

export * as ThreadMessageActivity from "./ThreadMessageActivity.ts";

/**
 * The facts recorded about messages. A message's position in its thread is recorded apart, as
 * activity, by `ThreadActivityFacts.Recorded`.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Group from "../group/Group.ts"
import * as GroupId from "../group/GroupId.ts"
import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as ThreadMessage from "./ThreadMessage.ts"

/**
 * A message was published, as its record says, with its thread's group, whose members may read
 * it. The group is on the payload because an audience is derived from the payload alone.
 *
 * @category facts
 * @since 0.1.0
 */
export const Published = Fact.make("thread.message.published", {
  version: 2,
  subject: (payload) => Subject.make("thread-message", payload.id),
  occurrence: (payload) => [payload.id],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Schema.Struct({ ...ThreadMessage.ThreadMessage.fields, groupId: GroupId.GroupId })
})

/**
 * A message's text and mentions were replaced, at its next revision. A revision is recorded once,
 * so a retried edit records nothing more and two edits racing for one revision cannot both land.
 *
 * @category facts
 * @since 0.1.0
 */
export const Edited = Fact.make("thread.message.edited", {
  version: 1,
  subject: (payload) => Subject.make("thread-message", payload.messageId),
  occurrence: (payload) => [payload.messageId, String(payload.revision)],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: ThreadMessage.Edited
})

/**
 * A message was deleted: its text is gone, while its place in the thread stays.
 *
 * @category facts
 * @since 0.1.0
 */
export const Deleted = Fact.make("thread.message.deleted", {
  version: 1,
  subject: (payload) => Subject.make("thread-message", payload.messageId),
  occurrence: (payload) => [payload.messageId],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: ThreadMessage.Deleted
})

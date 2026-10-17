/**
 * The kinds of activity a message records in its thread's timeline: its publication, which is new
 * activity for readers, and its quiet edits and deletion. `ThreadMessageTimeline` shows them.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Subject from "../journal/Subject.ts"
import * as ThreadActivityKind from "./ThreadActivityKind.ts"
import * as ThreadMessage from "./ThreadMessage.ts"
import * as ThreadMessageId from "./ThreadMessageId.ts"

const subject = ({ messageId }: { readonly messageId: ThreadMessageId.ThreadMessageId }) =>
  Subject.make("message", messageId)

/**
 * A message was published to the thread. It is the thread's latest activity for its readers, and
 * a message is published once, so its subject is its occurrence.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Published = ThreadActivityKind.make("message.published", {
  version: 1,
  details: Schema.Struct({ messageId: ThreadMessageId.ThreadMessageId }),
  subject,
  newActivity: true
})

/**
 * @category kinds
 * @since 0.1.0
 */
export type Published = ThreadActivityKind.Activity<typeof Published>

/**
 * A message's text was replaced, at the revision recorded. A revision is edited once, so the
 * message and revision are its occurrence, and a retried edit records nothing more.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Edited = ThreadActivityKind.make("message.edited", {
  version: 1,
  details: Schema.Struct({ messageId: ThreadMessageId.ThreadMessageId, revision: ThreadMessage.Revision }),
  subject,
  occurrence: ({ messageId, revision }) => [subject({ messageId }), String(revision)],
  newActivity: false
})

/**
 * @category kinds
 * @since 0.1.0
 */
export type Edited = ThreadActivityKind.Activity<typeof Edited>

/**
 * A message was deleted. It is deleted once, so its subject is its occurrence.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Deleted = ThreadActivityKind.make("message.deleted", {
  version: 1,
  details: Schema.Struct({ messageId: ThreadMessageId.ThreadMessageId }),
  subject,
  newActivity: false
})

/**
 * @category kinds
 * @since 0.1.0
 */
export type Deleted = ThreadActivityKind.Activity<typeof Deleted>

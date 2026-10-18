/**
 * What `NotificationService.inbox` takes and returns: a page of the acting member's notifications,
 * newest first, each with the timeline item it tells of while they may still read it, and what
 * `countPending` counts of them. Protocols carry `Item` and `Counts` to clients as they are.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as ThreadTimeline from "../thread/ThreadTimeline.ts"
import * as Notification from "./Notification.ts"
import * as NotificationStore from "./NotificationStore.ts"

/**
 * One page of a reader's inbox, newest first: all of it, or what still waits for them.
 *
 * @category options
 * @since 0.1.0
 */
export const Options = Schema.Struct({
  ...NotificationStore.LatestOptions.fields,
  pendingOnly: Schema.optionalKey(Schema.Boolean)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface Options extends Schema.Schema.Type<typeof Options> {}

/**
 * A notification in its recipient's inbox, with the activity it points to while the recipient can
 * still read it. Access is current, as when resolving one source: someone who left the group keeps
 * the notification without its activity.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Item = Schema.Struct({
  notification: Notification.Notification,
  source: Schema.optionalKey(ThreadTimeline.Item)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Item extends Schema.Schema.Type<typeof Item> {}

/**
 * How many of the acting member's notifications are still pending: from anywhere, and from each
 * group's threads, for groups with any.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Counts = Schema.Struct({
  pending: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  groups: Schema.Array(NotificationStore.PendingCount)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Counts extends Schema.Schema.Type<typeof Counts> {}

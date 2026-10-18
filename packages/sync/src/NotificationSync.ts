/**
 * How a member marks their notifications seen, as actions their browser writes: it applies each at
 * once, and the server runs it as a `NotificationService` operation.
 *
 * @since 0.1.0
 */

import { Notification, NotificationStore } from "@amends-dev/core/notification"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/**
 * How a member marks their notifications seen: one, or every one recorded up to a point. Each
 * action's primary key is the notification, or the member's inbox.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  .add({
    tag: "NotificationSeen",
    primaryKey: ({ notificationId }) => notificationId,
    payload: Schema.Struct({ notificationId: Notification.NotificationId })
  })
  // Mark every pending notification up to and including `through` seen: `NotificationService.markSeenThrough`.
  .add({
    tag: "NotificationsSeenThrough",
    primaryKey: () => "inbox",
    payload: Schema.Struct({ through: NotificationStore.Cursor })
  })

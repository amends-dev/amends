/**
 * What a member's browser and the server exchange about the member's notifications. `Actions` are
 * how the member marks them seen, which their browser applies at once and the server runs as
 * `NotificationService` operations. `Changes` keep the notifications in their replica current.
 *
 * @since 0.1.0
 */

import { Notification, NotificationStore } from "@amends-dev/core/notification"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

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

/**
 * The member's own notifications, which a replica holds.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges(
    "Notification",
    Notification.Notification,
    Schema.Struct({ id: Notification.NotificationId }),
    ({ id }) => ({ id })
  )
)

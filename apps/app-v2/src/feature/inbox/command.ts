/** Marking notifications seen, each an action written to the person's store. */

import { Notification, NotificationStore } from "@amends-dev/core/notification"
import * as Layer from "effect/Layer"
import * as Stores from "../../store/Stores.ts"
import { InboxDefinition, Message } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Mark the notification `notificationId` seen. */
export const MarkNotificationSeen = InboxDefinition.command("MarkNotificationSeen", {
  args: { ...Stores.AsMember, notificationId: Notification.NotificationId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ notificationId, ...member }) =>
      write(member, (store) => store.write("NotificationSeen", { notificationId }))
  }
})

/** Mark every notification seen, up to and including the one `through` names. */
export const MarkAllNotificationsSeen = InboxDefinition.command("MarkAllNotificationsSeen", {
  args: { ...Stores.AsMember, through: NotificationStore.Cursor },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ through, ...member }) => write(member, (store) => store.write("NotificationsSeenThrough", { through }))
  }
})

export const EffectsLayer = Layer.mergeAll(MarkNotificationSeen.layer, MarkAllNotificationsSeen.layer)

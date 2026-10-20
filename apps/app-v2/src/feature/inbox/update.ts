import type { Notification } from "@amends-dev/core/notification"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import { InboxComposition, selectNotification } from "./composition.ts"
import {
  InboxDefinition,
  isNotificationWaiting,
  Message,
  type Model,
  messageOfNotification,
  newestWaiting,
  OutMessage,
  pageSize,
  threadOfNotification
} from "./definition.ts"

/** Close the thread opened beside the inbox, which leaves no notification selected. */
const closeThread = InboxDefinition.stepFields(() => ({ selected: () => Option.none() }))

/** Mark the notification `notificationId` seen, unless it already is. */
const writeSeenWhenWaiting = (notificationId: Notification.NotificationId) =>
  InboxDefinition.step((model: Model) => ({
    model,
    commands: isNotificationWaiting(model, notificationId)
      ? [MarkNotificationSeen({ workspaceId: model.workspaceId, memberId: model.memberId, notificationId })]
      : []
  }))

export const update = InboxComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  return Message.match(message, {
    ReceivedInbox: ({ items }) => ({ model: modifyFields(model, { items: () => items, isLoaded: () => true }) }),
    ReceivedGroups: ({ groups }) => ({ model: modifyFields(model, { groups: () => groups }) }),
    ReceivedPeople: ({ members, contacts }) => ({
      model: modifyFields(model, { members: () => members, contacts: () => contacts })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedTryAgain: () => ({
      model: modifyFields(model, { notice: () => Option.none(), reads: (reads) => reads + 1 })
    }),
    ChoseTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab }) }),
    ClickedShowOlder: () => ({ model: modifyFields(model, { shown: (shown) => shown + pageSize }) }),
    ClickedOpen: ({ notificationId }) =>
      Option.match(threadOfNotification(model, notificationId), {
        onNone: () => ({ model }),
        onSome: ({ groupId, threadId }) =>
          Update.withOutMessage(
            Update.combine(model, [
              writeSeenWhenWaiting(notificationId),
              selectNotification(notificationId, groupId, threadId, messageOfNotification(model, notificationId))
            ]),
            OutMessage.OpenedThread()
          )
      }),
    ClickedClose: () => Update.withOutMessage(Update.combine(model, [closeThread]), OutMessage.ClosedThread()),
    ClickedMarkAllSeen: () =>
      Option.match(newestWaiting(model), {
        onNone: () => ({ model }),
        onSome: ({ recordedAt, id }) => ({
          model,
          commands: [MarkAllNotificationsSeen({ workspaceId, memberId, through: { recordedAt, id } })]
        })
      }),
    RequestedCloseThread: () => Update.combine(model, [closeThread]),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})

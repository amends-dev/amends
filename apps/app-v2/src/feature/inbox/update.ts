import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { MarkAllNotificationsSeen, MarkNotificationSeen } from "./command.ts"
import { InboxComposition } from "./composition.ts"
import { Message, newestWaiting, OutMessage, threadOfNotification } from "./definition.ts"

export const update = InboxComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  return Message.match(message, {
    ReceivedInbox: ({ items }) => ({ model: modifyFields(model, { items: () => items }) }),
    ReceivedGroups: ({ groups }) => ({ model: modifyFields(model, { groups: () => groups }) }),
    ReceivedPeople: ({ members, contacts }) => ({
      model: modifyFields(model, { members: () => members, contacts: () => contacts })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ChoseTab: ({ tab }) => ({ model: modifyFields(model, { tab: () => tab }) }),
    // Opening the thread reads it, which settles its notifications.
    ClickedOpen: ({ notificationId }) =>
      Option.match(threadOfNotification(model, notificationId), {
        onNone: () => ({ model }),
        onSome: ({ groupId, threadId }) => ({ model, outMessage: OutMessage.OpenedThread({ groupId, threadId }) })
      }),
    ClickedMarkSeen: ({ notificationId }) => ({
      model,
      commands: [MarkNotificationSeen({ workspaceId, memberId, notificationId })]
    }),
    ClickedMarkAllSeen: () =>
      Option.match(newestWaiting(model), {
        onNone: () => ({ model }),
        onSome: ({ recordedAt, id }) => ({
          model,
          commands: [MarkAllNotificationsSeen({ workspaceId, memberId, through: { recordedAt, id } })]
        })
      }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})

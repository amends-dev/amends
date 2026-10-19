/**
 * The person's inbox: the notifications waiting for them, newest first, each as the message it is
 * about, the thread it comes from and the message its activity is about, when the store holds
 * them. They open a notification's thread, or mark notifications seen, one at a time or all at
 * once. It reports the thread the person opens.
 */

import { Contact } from "@amends-dev/core/channel"
import { Group, GroupId } from "@amends-dev/core/group"
import { Notification, NotificationStore } from "@amends-dev/core/notification"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { authorName, groupName, messageText, threadLabel } from "../../seen.ts"

/**
 * A notification, the thread it comes from with its opening message, and the message its activity
 * is about, when the replica holds them.
 */
export const InboxItem = Schema.Struct({
  notification: Notification.Notification,
  thread: Schema.Option(Thread.Thread),
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  message: Schema.Option(ThreadMessage.ThreadMessage)
})
export type InboxItem = typeof InboxItem.Type

/**
 * The person's notifications, the groups and the people that name where they come from and who
 * wrote them, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  items: Schema.Array(InboxItem),
  groups: Schema.Array(Group.Group),
  members: Schema.Array(Member.Member),
  contacts: Schema.Array(Contact.Contact),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedInbox: { items: Schema.Array(InboxItem) },
  ReceivedGroups: { groups: Schema.Array(Group.Group) },
  ReceivedPeople: { members: Schema.Array(Member.Member), contacts: Schema.Array(Contact.Contact) },
  FailedRead: { error: Schema.String },
  ClickedOpen: { notificationId: Notification.NotificationId },
  ClickedMarkSeen: { notificationId: Notification.NotificationId },
  ClickedMarkAllSeen: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedThread: { groupId: GroupId.GroupId, threadId: ThreadId.ThreadId }
})
export type OutMessage = typeof OutMessage.Type

export const InboxDefinition = Block.makeDefinition("Inbox", { Model, Message, OutMessage })

/** Whether a notification still waits for the person to see it. */
const isWaiting = ({ notification }: InboxItem): boolean => Notification.State.isAnyOf(["Pending"])(notification.state)

const newestFirst = Order.mapInput(Order.flip(DateTime.Order), ({ notification }: InboxItem) => notification.recordedAt)

/** The notifications still waiting for the person, newest first. */
export const waitingNewestFirst = (model: Model): ReadonlyArray<InboxItem> =>
  model.items.filter(isWaiting).toSorted(newestFirst)

/** How many notifications wait for the person. */
export const waitingCount = (model: Model): number => model.items.filter(isWaiting).length

/** The newest notification still waiting, in the inbox order core marks them seen by. */
export const newestWaiting = (model: Model): Option.Option<Notification.Notification> =>
  model.items
    .filter(isWaiting)
    .reduce<Option.Option<Notification.Notification>>(
      (newest, { notification }) =>
        Option.isSome(newest) && !NotificationStore.isAtOrBefore(newest.value, notification)
          ? newest
          : Option.some(notification),
      Option.none()
    )

/** The thread notification `notificationId` comes from, when it comes from one. */
export const threadOfNotification = (
  model: Model,
  notificationId: Notification.NotificationId
): Option.Option<Notification.ThreadReference> =>
  Option.fromUndefinedOr(
    model.items.find(({ notification }) => notification.id === notificationId)?.notification.thread
  )

/**
 * What a notification tells the person: who wrote the message it is about, and in which thread, as
 * its group lists it.
 */
export const describeNotification = (item: InboxItem, model: Model): string => {
  const what = Option.match(item.message, {
    onNone: () => "New activity",
    onSome: (message) => `${authorName(message, model.members, model.contacts)}: ${messageText(message)}`
  })
  return Option.match(item.thread, {
    onNone: () => what,
    onSome: (thread) => {
      const group = model.groups.find(({ id }) => id === thread.groupId)
      const label = threadLabel(thread, item.opening)
      return `${what} · ${group === undefined ? label : `${label} in ${groupName(group, model.members, model.memberId)}`}`
    }
  })
}

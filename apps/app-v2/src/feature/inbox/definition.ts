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
import { authorName, groupName, initials, messageText, threadLabel } from "../../seen.ts"

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

/** Who wrote the message a notification's activity is about, with the letters that mark them, or the activity alone. */
export const notificationAuthor = (item: InboxItem, model: Model): Readonly<{ name: string; mark: string }> =>
  Option.match(item.message, {
    onNone: () => ({ name: "Activity", mark: "?" }),
    onSome: (message) => {
      const name = authorName(message, model.members, model.contacts)
      return { name, mark: initials(name) }
    }
  })

/** Where a notification comes from: its thread, and the group as its members list it, when the store holds them. */
export const notificationContext = (item: InboxItem, model: Model): Option.Option<string> =>
  Option.map(item.thread, (thread) => {
    const label = threadLabel(thread, item.opening)
    const group = model.groups.find(({ id }) => id === thread.groupId)
    return group === undefined ? label : `${label} in ${groupName(group, model.members, model.memberId)}`
  })

/** What the message a notification's activity is about says, or that there was activity. */
export const notificationText = (item: InboxItem): string =>
  Option.match(item.message, { onNone: () => "New activity", onSome: messageText })

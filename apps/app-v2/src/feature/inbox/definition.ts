/**
 * The person's inbox: their notifications, only those waiting, which it opens on, or every one, newest first, under the
 * days they came, each by the author of the message its activity is about, what they did, the group
 * it comes from, and what the message says, as far as the store holds them. They open a
 * notification's thread beside the inbox, which marks that notification seen, and the row stays
 * selected, in its place, while the thread is open; or they mark every notification seen at once. The
 * list shows the newest few and the person asks for older ones a page at a time. A notification's author opens their
 * card. It reports when the thread opens and when the person closes it, and the card the person opens, and closes the
 * thread when its parent asks.
 */

import { Contact } from "@amends-dev/core/channel"
import { Group, GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification, NotificationStore } from "@amends-dev/core/notification"
import { Thread, ThreadId, ThreadMessage, ThreadMessageId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { ThreadBlock } from "../thread/block.ts"

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

/** Which notifications the inbox shows: only those still waiting, or every one. */
export const Tab = Schema.Literals(["Unread", "All"])
export type Tab = typeof Tab.Type

/**
 * The notification the person opened, the thread it comes from, in its group, the message its activity is
 * about, while the store holds it, and the thread Block that shows the thread beside the inbox.
 */
export const Selected = Schema.Struct({
  notificationId: Notification.NotificationId,
  threadId: ThreadId.ThreadId,
  groupId: GroupId.GroupId,
  messageId: Schema.Option(ThreadMessageId.ThreadMessageId),
  model: ThreadBlock.Model
})
export type Selected = typeof Selected.Type

/** How many notifications the list shows at first, and how many more each Show older adds. */
export const pageSize = 20

/**
 * The person's notifications, whether they were read yet, which of them the inbox shows, how many of the newest it
 * lists, the one they opened with its thread, the groups and the people that name where they come from and who wrote
 * them, how many times the person asked to read them again, whether they asked to mark every
 * notification seen and the write is on its way, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  tab: Tab,
  shown: Schema.Int,
  isLoaded: Schema.Boolean,
  items: Schema.Array(InboxItem),
  selected: Schema.Option(Selected),
  groups: Schema.Array(Group.Group),
  members: Schema.Array(Member.Member),
  contacts: Schema.Array(Contact.Contact),
  reads: Schema.Int,
  isMarkingAllSeen: Schema.Boolean,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedInbox: { items: Schema.Array(InboxItem) },
  ReceivedGroups: { groups: Schema.Array(Group.Group) },
  ReceivedPeople: { members: Schema.Array(Member.Member), contacts: Schema.Array(Contact.Contact) },
  FailedRead: { error: Schema.String },
  ClickedTryAgain: {},
  ChoseTab: { tab: Tab },
  ClickedShowOlder: {},
  ClickedOpen: { notificationId: Notification.NotificationId },
  ClickedClose: {},
  OpenedProfile: { memberId: Schema.String, triggerId: Schema.String },
  ClickedMarkAllSeen: {},
  RequestedCloseThread: {},
  RequestedSelection: {
    tab: Tab,
    notificationId: Notification.NotificationId,
    groupId: GroupId.GroupId,
    threadId: ThreadId.ThreadId
  },
  RequestedTab: { tab: Tab },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String },
  WroteAllSeen: {},
  FailedWriteAllSeen: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ChangedTab: {},
  OpenedThread: {},
  ClosedThread: {},
  OpenedAgent: { agentId: Identity.AgentId },
  OpenedProfile: { memberId: Schema.String, triggerId: Schema.String }
})
export type OutMessage = typeof OutMessage.Type

export const InboxDefinition = Block.makeDefinition("Inbox", { Model, Message, OutMessage })

/** Whether a notification still waits for the person to see it. */
export const isWaiting = ({ notification }: InboxItem): boolean =>
  Notification.State.isAnyOf(["Pending"])(notification.state)

const byNewest = Order.mapInput(Order.flip(DateTime.Order), ({ notification }: InboxItem) => notification.recordedAt)

/** Whether `item` is the notification the person opened, whose thread is open. */
export const isSelected = (model: Model, { notification }: InboxItem): boolean =>
  Option.exists(model.selected, ({ notificationId }) => notificationId === notification.id)

/**
 * The notifications the tab keeps, newest first: on All every one, on Unread those still waiting and the one the
 * person opened, which stays in its place while its thread is open, though it is no longer waiting.
 */
const tabItems = (model: Model): ReadonlyArray<InboxItem> => {
  const items =
    model.tab === "All" ? model.items : model.items.filter((item) => isWaiting(item) || isSelected(model, item))

  return items.toSorted(byNewest)
}

/**
 * The notifications the tab lists, newest first, as many as the person has asked for, and the one they opened
 * wherever it falls, so that it stays in its place while its thread is open.
 */
export const shownItems = (model: Model): ReadonlyArray<InboxItem> =>
  tabItems(model).filter((item, index) => index < model.shown || isSelected(model, item))

/** Whether the tab keeps notifications older than those it lists. */
export const hasOlderItems = (model: Model): boolean => tabItems(model).length > shownItems(model).length

/** How many notifications wait for the person, which counts none that was only kept in place. */
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

/** The notification `notificationId`, with what the store holds of its thread and message. */
export const itemOfNotification = (
  model: Model,
  notificationId: Notification.NotificationId
): Option.Option<InboxItem> =>
  Option.fromUndefinedOr(model.items.find(({ notification }) => notification.id === notificationId))

/** Whether notification `notificationId` still waits for the person to see it. */
export const isNotificationWaiting = (model: Model, notificationId: Notification.NotificationId): boolean =>
  Option.exists(itemOfNotification(model, notificationId), isWaiting)

/** The thread notification `notificationId` comes from, when it comes from one. */
export const threadOfNotification = (
  model: Model,
  notificationId: Notification.NotificationId
): Option.Option<Notification.ThreadReference> =>
  Option.flatMap(itemOfNotification(model, notificationId), ({ notification }) =>
    Option.fromUndefinedOr(notification.thread)
  )

/** The message notification `notificationId`'s activity is about, while the store holds it. */
export const messageOfNotification = (
  model: Model,
  notificationId: Notification.NotificationId
): Option.Option<ThreadMessageId.ThreadMessageId> =>
  Option.flatMap(itemOfNotification(model, notificationId), ({ message }) => Option.map(message, ({ id }) => id))

/** The group `groupId`, while the store holds it. */
export const findGroup = (model: Model, groupId: GroupId.GroupId): Option.Option<Group.Group> =>
  Option.fromUndefinedOr(model.groups.find(({ id }) => id === groupId))

/** What the message a notification is about is to the person: it addresses them, opens the thread, or replies. */
export type Reason = "Mention" | "Thread" | "Reply"

/** Whether `message` addresses `memberId`: its mentions hold them. */
const addresses = (message: ThreadMessage.ThreadMessage, memberId: MemberId.MemberId): boolean =>
  ThreadMessage.Content.match(message.content, {
    Text: ({ mentions }) => mentions.includes(memberId),
    Deleted: () => false
  })

/** Why `message` is for `memberId`: it addresses them, it opens its thread, or it replies in it. */
const reasonFor = (
  message: ThreadMessage.ThreadMessage,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  memberId: MemberId.MemberId
): Reason => {
  if (addresses(message, memberId)) return "Mention"
  return Option.exists(opening, ({ id }) => id === message.id) ? "Thread" : "Reply"
}

/** Why the person is told of the message their notification's activity is about, while the store holds it. */
export const notificationReason = (item: InboxItem, memberId: MemberId.MemberId): Option.Option<Reason> =>
  Option.map(item.message, (message) => reasonFor(message, item.opening, memberId))

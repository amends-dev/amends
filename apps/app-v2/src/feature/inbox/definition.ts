/**
 * The person's inbox: their notifications, every one or only those waiting, newest first, under the
 * days they came, each by the author of the message its activity is about, what they did, the group
 * it comes from, and what the message says, as far as the store holds them. They open a
 * notification's thread, or mark notifications seen, one at a time or all at once. It reports the
 * thread the person opens.
 */

import { Contact } from "@amends-dev/core/channel"
import { Group, GroupId } from "@amends-dev/core/group"
import { Notification, NotificationStore } from "@amends-dev/core/notification"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { authorName, dayLabel, dayOf, groupName, initials, messageText } from "../../seen.ts"

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

/** Which notifications the inbox shows: every one, or only those still waiting. */
export const Tab = Schema.Literals(["All", "Unread"])
export type Tab = typeof Tab.Type

/**
 * The person's notifications, which of them the inbox shows, the groups and the people that name where
 * they come from and who wrote them, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  tab: Tab,
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
  ChoseTab: { tab: Tab },
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
export const isWaiting = ({ notification }: InboxItem): boolean =>
  Notification.State.isAnyOf(["Pending"])(notification.state)

const byNewest = Order.mapInput(Order.flip(DateTime.Order), ({ notification }: InboxItem) => notification.recordedAt)

/** Every notification the person has, waiting or seen, newest first. */
export const allNewestFirst = (model: Model): ReadonlyArray<InboxItem> => model.items.toSorted(byNewest)

/** The notifications still waiting for the person, newest first. */
export const waitingNewestFirst = (model: Model): ReadonlyArray<InboxItem> =>
  model.items.filter(isWaiting).toSorted(byNewest)

/** The notifications the tab shows, newest first. */
export const shownNewestFirst = (model: Model): ReadonlyArray<InboxItem> =>
  model.tab === "All" ? allNewestFirst(model) : waitingNewestFirst(model)

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

/** The notifications that came on one local day, newest first, under what that day is called. */
export type InboxDay = Readonly<{ label: string; items: ReadonlyArray<InboxItem> }>

/**
 * `items`, newest first, as the days they came on by the person's own clock, each named as it is from `now`:
 * "Today", "Yesterday", a weekday, or a date.
 */
export const byDay = (items: ReadonlyArray<InboxItem>, now: DateTime.Utc): ReadonlyArray<InboxDay> => {
  const dated = items.map((item) => ({ item, day: dayOf(item.notification.recordedAt) }))

  return Array.isReadonlyArrayNonEmpty(dated)
    ? Array.groupWith(dated, (a, b) => DateTime.Equivalence(a.day, b.day)).map((run) => ({
        label: dayLabel(run[0].day, now),
        items: run.map(({ item }) => item)
      }))
    : []
}

/** What the message a notification is about is to the person: it addresses them, opens the thread, or replies. */
export type Reason = "Mention" | "Thread" | "Reply"

/** What a notification's author did, as the first line says it after their name. */
const doneForReason: Readonly<Record<Reason, string>> = {
  Mention: "mentioned you",
  Thread: "started a thread",
  Reply: "replied"
}

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

/** Who wrote the message a notification's activity is about, with their letters, while the store holds it. */
const notificationAuthor = (item: InboxItem, model: Model): Option.Option<Readonly<{ name: string; mark: string }>> =>
  Option.map(item.message, (message) => {
    const name = authorName(message.author, model.members, model.contacts)
    return { name, mark: initials(name) }
  })

/**
 * A notification's first line: the mark and name of who wrote the message its activity is about and what
 * they did, or, while the store lacks the message, that there was activity.
 */
export const notificationHeadline = (
  item: InboxItem,
  model: Model
): Readonly<{ mark: string; author: string; activity: string }> =>
  Option.match(Option.all([notificationAuthor(item, model), notificationReason(item, model.memberId)]), {
    onNone: () => ({ mark: "?", author: "Activity", activity: "in a thread" }),
    onSome: ([{ name, mark }, reason]) => ({ mark, author: name, activity: doneForReason[reason] })
  })

/**
 * Where a notification comes from: a team by its name, a conversation by the others in it, or that the thread is
 * unavailable while the store lacks it. Nothing for a notification from no thread, or while the store lacks the
 * thread's group.
 */
export const notificationPlace = (item: InboxItem, model: Model): Option.Option<string> =>
  item.notification.thread === undefined
    ? Option.none()
    : Option.match(item.thread, {
        onNone: () => Option.some("Unavailable thread"),
        onSome: ({ groupId }) =>
          Option.map(Option.fromUndefinedOr(model.groups.find(({ id }) => id === groupId)), (group) =>
            group.kind === "Team"
              ? `#${group.name}`
              : `${groupName(group, model.members, model.memberId)} · Direct message`
          )
      })

/** What the message a notification's activity is about says, or why there is nothing to read. */
export const notificationText = (item: InboxItem): string =>
  Option.match(item.message, {
    onNone: () =>
      Option.isSome(item.thread) ? "Open the thread to see what happened." : "You can no longer see this thread.",
    onSome: messageText
  })

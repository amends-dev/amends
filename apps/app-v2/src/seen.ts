/**
 * What the person sees of the workspace's records: what a member, a connection, and a group are called, what letters
 * mark them, and
 * where a group is as a line says it, who wrote a message and what it says, as the markdown a view shows and as the
 * words it comes to without its syntax, with a mention in it as its member's current name, when a time was, by its time
 * of day, short or whole, its day, either as a message shows it, and how long ago it was, the date something was made,
 * which day each of a list's items falls on, which of a list's messages stack under the one before, how a thread is
 * titled, where it is, how many replies it has, and who types in it,
 * whether anyone may join a group, how two texts are compared when the person searches and whether a thread's title or
 * opening has what they search for, how a task's status and priority and a turn's status read and how a status is
 * drawn, which statuses leave a task open, and when an invitation closes.
 */

import type { Contact } from "@amends-dev/core/channel"
import type { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import type { Presence } from "@amends-dev/core/presence"
import type { ReplicaRecord } from "@amends-dev/core/replica"
import type { Task } from "@amends-dev/core/task"
import { type Thread, type ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import type { Turn } from "@amends-dev/core/turn"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { MarkContent, TaskStatusShape } from "@amends-dev/design/mark"
import { type MessageText, messageTextWords } from "@amends-dev/design/message"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/** The uppercase first letters of the first two words of `name`, or of its first word alone. */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.fromIterable(word).at(0) ?? "")
    .join("")
    .toUpperCase()

/** The time of day `dateTime` was, in the person's own time zone, as they read it: "10:02 AM". */
export const timeOf = (dateTime: DateTime.DateTime): string =>
  DateTime.formatLocal(dateTime, { hour: "numeric", minute: "2-digit" })

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

/**
 * The time of day `dateTime` was, in the person's own time zone, without AM or PM, where there is little room: "10:02".
 */
export const shortTimeOf = (dateTime: DateTime.DateTime): string =>
  clock
    .formatToParts(DateTime.toDateUtc(dateTime))
    .filter(({ type }) => type !== "dayPeriod")
    .map(({ value }) => value)
    .join("")
    .trim()

/** The day and time `dateTime` was, with the weekday, as a tooltip names it: "Sunday, October 18, 2026 at 10:02 AM". */
export const fullTimeOf = (dateTime: DateTime.DateTime): string =>
  DateTime.formatLocal(dateTime, { dateStyle: "full", timeStyle: "short" })

const millisPerMinute = 60_000
const millisPerHour = 3_600_000
const millisPerDay = 86_400_000

/** The start of the day `at` fell on, in the person's own time zone, to group times by. */
export const dayOf = (at: DateTime.DateTime): DateTime.Zoned =>
  DateTime.startOf(DateTime.setZone(at, DateTime.zoneMakeLocal()), "day")

/** How many days before the day `today` the day `day` is, which a day with 23 or 25 hours does not change. */
const daysBefore = (day: DateTime.Zoned, today: DateTime.Zoned): number =>
  Math.round((DateTime.toEpochMillis(today) - DateTime.toEpochMillis(day)) / millisPerDay)

/**
 * `day` as the person reads it from `today`: "Today", "Yesterday", the weekday's name within the six days before,
 * then the date, with the year when it is not this one. `style` is how long the weekday and the month are spelled.
 */
const readDay = (day: DateTime.Zoned, today: DateTime.Zoned, style: "long" | "short"): string => {
  const daysAgo = daysBefore(day, today)
  if (daysAgo <= 0) return "Today"
  if (daysAgo === 1) return "Yesterday"
  if (daysAgo <= 6) return DateTime.formatLocal(day, { weekday: style })
  const isThisYear = DateTime.toParts(day).year === DateTime.toParts(today).year
  return DateTime.formatLocal(day, { month: style, day: "numeric", year: isThisYear ? undefined : "numeric" })
}

/** The day `day` began, as a divider names it from `now`: "Today", "Yesterday", "Tuesday", "September 20". */
export const dayLabel = (day: DateTime.Zoned, now: DateTime.DateTime): string => readDay(day, dayOf(now), "long")

/** The things that happened on one local day, under what that day is called. */
export type Day<Item> = Readonly<{ label: string; items: ReadonlyArray<Item> }>

/**
 * `items`, in the order given, as the days they happened on by the person's own clock, each named as it is from
 * `now`: "Today", "Yesterday", a weekday, or a date. `happenedAt` says when an item happened.
 */
export const groupByDay = <Item>(
  items: ReadonlyArray<Item>,
  happenedAt: (item: Item) => DateTime.DateTime,
  now: DateTime.DateTime
): ReadonlyArray<Day<Item>> => {
  const dated = items.map((item) => ({ item, day: dayOf(happenedAt(item)) }))

  return Array.isReadonlyArrayNonEmpty(dated)
    ? Array.groupWith(dated, (a, b) => DateTime.Equivalence(a.day, b.day)).map((run) => ({
        label: dayLabel(run[0].day, now),
        items: run.map(({ item }) => item)
      }))
    : []
}

/** How soon after its author's message another stacks under it. */
const stackWithin = 5 * millisPerMinute

/** What decides whether a message stacks: who wrote it, when, and whether it opens a thread that has replies. */
export type Stackable = Readonly<{ author: ThreadMessage.Author; at: DateTime.DateTime; hasReplies: boolean }>

const sameAuthor = Schema.toEquivalence(ThreadMessage.Author)

/**
 * Whether `message` stacks under `previous`, the message just before it with nothing between, as `apps/ui`'s timeline
 * stacks them: by the same author, within five minutes after it, and neither has replies, since a thread's replies end
 * a stack and start their own. The first message has none before it.
 */
export const isStackedUnder = (message: Stackable, previous: Stackable | undefined): boolean => {
  if (previous === undefined || message.hasReplies || previous.hasReplies) {
    return false
  }

  const gap = DateTime.toEpochMillis(message.at) - DateTime.toEpochMillis(previous.at)

  return sameAuthor(message.author, previous.author) && gap >= 0 && gap < stackWithin
}

/**
 * When `at` was, as a message shows it: its time of day when it was today, as "9:41 AM", otherwise the name
 * of its day from `now`, as `dayLabel` gives it: "Yesterday", "Tuesday", "September 20".
 */
export const whenLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const day = dayOf(at)
  return daysBefore(day, dayOf(now)) <= 0 ? timeOf(at) : dayLabel(day, now)
}

/**
 * How long before `now` it was `at`: "Just now", "12m ago", and "3h ago" within the day, then, by the day,
 * "Yesterday", "Tue", and "Sep 20", with the year when it is not this one.
 */
export const ageLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const elapsed = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(at)
  if (elapsed < millisPerMinute) return "Just now"
  if (elapsed < millisPerHour) return `${Math.floor(elapsed / millisPerMinute)}m ago`
  const day = dayOf(at)
  const today = dayOf(now)
  return daysBefore(day, today) <= 0 ? `${Math.floor(elapsed / millisPerHour)}h ago` : readDay(day, today, "short")
}

/** The day `at` fell on, by the person's own clock, with its year, as a record says when it was made: "Oct 6, 2026". */
export const calendarDate = (at: DateTime.DateTime): string =>
  DateTime.formatLocal(at, { month: "short", day: "numeric", year: "numeric" })

/**
 * How long the app's time now may be behind the clock: the root reads the time once a minute, so an invitation the host
 * made a moment ago can end a week and some seconds after the time the app holds.
 */
const clockLag = millisPerMinute

/** How long is left until `at` by the app's time `now`, and what is left once its lag of a minute is counted. */
const timeLeft = (at: DateTime.DateTime, now: DateTime.DateTime): Readonly<{ remaining: number; counted: number }> => {
  const remaining = DateTime.toEpochMillis(at) - DateTime.toEpochMillis(now)
  return { remaining, counted: remaining - clockLag }
}

/**
 * How long after `now` it will be `at`, as the member settings say when an invitation closes, as `apps/ui` says it:
 * "Expires in 7 days", by the days left rounded up, and so at least one, so that an invitation made for a week reads
 * seven until a day of it has passed, and "Expired" once `at` has come. The days are counted from a minute after `now`,
 * which the app's time may be behind by.
 */
export const expiryInDaysLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const { remaining, counted } = timeLeft(at, now)
  const days = Math.max(1, Math.ceil(counted / millisPerDay))
  return remaining <= 0 ? "Expired" : `Expires in ${pluralize(days, "day", "days")}`
}

/** The most days an invitation's end is told in days, as `apps/ui` tells it; a later end is told by its date. */
const mostDaysToldInDays = 30

/**
 * How long after `now` it will be `at`, as the workspace list says when an invitation closes, as `apps/ui` says it: in
 * hours, rounded up and at least one, while less than a day is left ("Expires in 5 hours"), "Expires tomorrow" once
 * the days left, rounded up, are one, "Expires in 3 days" up to thirty days, the date after that ("Expires Oct 6,
 * 2026"), and "Expired" once `at` has come. What is left is counted from a minute after `now`, which the app's time
 * may be behind by, so that an invitation made for a week reads seven days until a day of it has passed.
 */
export const expiryLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const { remaining, counted } = timeLeft(at, now)

  if (remaining <= 0) {
    return "Expired"
  }

  if (counted < millisPerDay) {
    return `Expires in ${pluralize(Math.max(1, Math.ceil(counted / millisPerHour)), "hour", "hours")}`
  }

  if (counted > mostDaysToldInDays * millisPerDay) {
    return `Expires ${calendarDate(at)}`
  }

  const days = Math.ceil(counted / millisPerDay)
  return days === 1 ? "Expires tomorrow" : `Expires in ${pluralize(days, "day", "days")}`
}

/** What a team's visibility means, as the person reads it under the choice of one. */
export const visibilityHint: Readonly<Record<Group.Visibility, string>> = {
  Public: "Anyone in the workspace can find this group and join it.",
  Private: "Only people added to this group can find it."
}

/** Whether the member is an agent. */
export const isAgent = (member: Member.Member): boolean => Identity.MemberReference.isAnyOf(["Agent"])(member.identity)

/** A member's mark: their initials, on the agent's tone for an agent. */
export const memberMark = (member: Member.Member): MarkContent => ({
  text: initials(member.name),
  tone: isAgent(member) ? "lilac" : "neutral"
})

/** `memberId` by their name among `members`, or their ID until names are read. */
export const memberName = (members: ReadonlyArray<Member.Member>, memberId: MemberId.MemberId): string =>
  members.find((member) => member.id === memberId)?.name ?? memberId

/** What the connection `connectionId` is called among `connections`, or "Removed connection" once it is gone. */
export const connectionNameIn = (
  connections: ReadonlyArray<Pick<ReplicaRecord.Connection, "id" | "name">>,
  connectionId: string
): string => connections.find(({ id }) => id === connectionId)?.name ?? "Removed connection"

/** The members `memberIds` by their names among `members`, as a conversation with them is named. */
export const namesOf = (members: ReadonlyArray<Member.Member>, memberIds: ReadonlyArray<MemberId.MemberId>): string =>
  memberIds.map((id) => memberName(members, id)).join(", ")

/** A group's name: a team's own, or a conversation's other members than `self`, by their names. */
export const groupName = (
  group: Group.Group,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  group.kind === "Team"
    ? group.name
    : namesOf(
        members,
        group.memberIds.filter((id) => id !== self)
      )

/** What marks `group`, named `name`, in a list: a team's `#`, or a conversation's other members' initials. */
export const groupMark = (group: Group.Group, name: string): string => (group.kind === "Team" ? "#" : initials(name))

/** Where `group` is, as a line says it: a team as `#` and its name, a conversation by the others in it. */
export const placeName = (
  group: Group.Group,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string => (group.kind === "Team" ? `#${group.name}` : groupName(group, members, self))

/** What a side pane is about: a thread, or the task it tracks. */
export type SideAbout = "Thread" | "Task"

/**
 * Where a thread or a task is, as the side pane's subtitle says it, as `apps/ui` does: "Thread in #general" for a team,
 * "Thread with Bob" for a conversation, or only "Thread" while its group is not read; "Task in #general" and "Task
 * with Bob" the same way.
 */
export const sideSubtitle = (
  about: SideAbout,
  group: Option.Option<Group.Group>,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  Option.match(group, {
    onNone: () => about,
    onSome: (known) => `${about} ${known.kind === "Team" ? "in" : "with"} ${placeName(known, members, self)}`
  })

/**
 * Where a thread is when the person came to it for a reason, as `apps/ui`'s inbox says it in the side pane's
 * subtitle: "Mention · #general", or only the reason while the thread's group is not read.
 */
export const reasonSubtitle = (
  reason: string,
  group: Option.Option<Group.Group>,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  Option.match(group, {
    onNone: () => reason,
    onSome: (known) => `${reason} · ${placeName(known, members, self)}`
  })

/** `author` by their name here: a member's, or the name a channel's contact gave. */
export const authorName = (
  author: ThreadMessage.Author,
  members: ReadonlyArray<Member.Member>,
  contacts: ReadonlyArray<Contact.Contact>
): string =>
  ThreadMessage.Author.match(author, {
    Member: ({ memberId }) => members.find((member) => member.id === memberId)?.name ?? "Someone",
    Contact: ({ contactId }) => contacts.find(({ id }) => id === contactId)?.name ?? "A contact"
  })

/** Whether `author` is a member that is an agent, which a message marks in the agent's tone and color. */
export const isAuthorAgent = (author: ThreadMessage.Author, members: ReadonlyArray<Member.Member>): boolean =>
  ThreadMessage.Author.match(author, {
    Member: ({ memberId }) => members.some((member) => member.id === memberId && isAgent(member)),
    Contact: () => false
  })

/**
 * `author`'s mark: a member's own, on the agent's tone for an agent, or the letters of the name a channel's contact
 * gave, or of the name a member without a record here is called.
 */
export const authorMark = (
  author: ThreadMessage.Author,
  members: ReadonlyArray<Member.Member>,
  contacts: ReadonlyArray<Contact.Contact>
): MarkContent => {
  const maybeMember = ThreadMessage.Author.match(author, {
    Member: ({ memberId }) => Option.fromUndefinedOr(members.find((member) => member.id === memberId)),
    Contact: () => Option.none<Member.Member>()
  })

  return Option.match(maybeMember, {
    onNone: () => ({ text: initials(authorName(author, members, contacts)) }),
    onSome: memberMark
  })
}

const deletedText = "Message deleted"

/**
 * What `message` says as the text a view shows: its markdown, with the members its mentions name, who are called what
 * they are now among `members`, or "Message deleted", which shows quiet and slanted.
 */
export const messageText = (message: ThreadMessage.ThreadMessage, members: ReadonlyArray<Member.Member>): MessageText =>
  ThreadMessage.Content.match(message.content, {
    Text: ({ text }): MessageText => ({ text, mentions: members }),
    Deleted: (): MessageText => ({ deleted: deletedText })
  })

/**
 * What `message` says as the words a reader hears, without its markdown's syntax: a mention as "@" and the member's
 * current name.
 */
export const messageWords = (message: ThreadMessage.ThreadMessage, members: ReadonlyArray<Member.Member>): string =>
  messageTextWords(messageText(message, members))

/** `count` of something, as the person reads it: "1 member", "4 members", by its `singular` and its `plural`. */
export const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`

/** How many replies a thread has, as the person reads it: "1 reply", "4 replies". */
export const repliesLabel = (replies: number): string => pluralize(replies, "reply", "replies")

const severalTyping = "Several people are typing…"

/**
 * Who types, as a line says it, as `apps/ui` does: "Ada is typing…" for one, "Ada and Bob are typing…" for two, and
 * "Several people are typing…" for three or more, and nothing while no one types.
 */
export const typingLine = (names: ReadonlyArray<string>): Option.Option<string> => {
  const [first, second] = names

  if (first === undefined) {
    return Option.none()
  }

  if (second === undefined) {
    return Option.some(`${first} is typing…`)
  }

  return Option.some(names.length === 2 ? `${first} and ${second} are typing…` : severalTyping)
}

/**
 * Who among `present` other than `self` types in the thread `threadId`, by their names among `members`, or "Someone"
 * for a member whose name is not read.
 */
export const typingNames = (
  present: ReadonlyArray<Presence.Present>,
  threadId: ThreadId.ThreadId,
  self: MemberId.MemberId,
  members: ReadonlyArray<Member.Member>
): ReadonlyArray<string> =>
  present
    .filter((who) => who.typingIn === threadId && who.memberId !== self)
    .map(({ memberId }) => members.find((member) => member.id === memberId)?.name ?? "Someone")

/**
 * A thread as the person reads it in a list: its title, as written, or its opening message as the text a view shows, or
 * "A thread".
 */
export const threadText = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>
): MessageText =>
  thread.title === null
    ? Option.match(opening, {
        onNone: (): MessageText => "A thread",
        onSome: (message) => messageText(message, members)
      })
    : thread.title

/** A thread as the person reads it in a list, as words: its title, or its opening's words, or "A thread". */
export const threadWords = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>
): string => messageTextWords(threadText(thread, opening, members))

/** Whether anyone in the workspace may join `group`: a public team. */
export const isJoinable = (group: Group.Group): boolean => group.kind === "Team" && group.visibility === "Public"

/** `text` in lower case with its accents taken off, so that "José" and "jose" are the same when searched for. */
export const foldAccents = (text: string): string => text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase()

/**
 * Whether the thread's title, or its opening's words as the person reads them among `members`, contain `query`, in
 * any case, whatever the accents and the spaces around it; every thread for a query with no letters.
 */
export const threadContains = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>,
  query: string
): boolean => {
  const wanted = foldAccents(query.trim())
  const words = [thread.title, ...Option.toArray(Option.map(opening, (message) => messageWords(message, members)))]

  return wanted === "" || words.some((text) => text !== null && foldAccents(text).includes(wanted))
}

/** A task's status, as the person reads it. */
export const statusLabel: Readonly<Record<Task.Status, string>> = {
  triage: "Triage",
  todo: "To do",
  doing: "Doing",
  held: "Held",
  done: "Done",
  dismissed: "Dismissed"
}

/**
 * How a task's status is drawn: the four drawings `apps/ui` has for triage, to do (open), doing (in progress), and
 * done, and a pause for held and a cross for dismissed, which `apps/ui` has no statuses for.
 */
export const statusShape: Readonly<Record<Task.Status, TaskStatusShape>> = {
  triage: "triage",
  todo: "open",
  doing: "progress",
  held: "paused",
  done: "done",
  dismissed: "dismissed"
}

/** Whether a task in `status` is open: it is neither done nor dismissed. */
export const isOpen = (status: Task.Status): boolean => status !== "done" && status !== "dismissed"

/** A task's priority, as the person reads it. */
export const priorityLabel: Readonly<Record<Task.Priority, string>> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
}

/** A turn's status, as the person reads it. */
export const turnStatusLabel: Readonly<Record<Turn.Status, string>> = {
  queued: "Queued",
  running: "Running",
  cancelling: "Stopping",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Stopped"
}

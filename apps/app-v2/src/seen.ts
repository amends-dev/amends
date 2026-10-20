/**
 * What the person sees of the workspace's records: what a member and a group are called, what letters mark them, and
 * where a group is as a line says it, who wrote a message and what it says, with a mention in it as its member's
 * current name, when a time was, by its time of day, its day, either as a message shows it, and how long ago it was,
 * the date something was made, which day each of a list's items falls on, how a thread is titled, where it is, and how
 * many replies it has, whether anyone may join a group, how two texts are compared when the person searches and whether
 * a thread's title or opening has what they search for, how a task's status and priority and a turn's status read,
 * which statuses leave a task open, and when an invitation closes.
 */

import type { Contact } from "@amends-dev/core/channel"
import type { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import type { Task } from "@amends-dev/core/task"
import { type Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Turn } from "@amends-dev/core/turn"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { MarkContent } from "@amends-dev/design/mark"
import type { TextRun } from "@amends-dev/design/message"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"

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

/**
 * How long after `now` it will be `at`, as an invitation says when it closes: "Expires in 7 days", by the days left
 * rounded up, and so at least one, as `apps/ui` says it, so that an invitation made for a week reads seven until
 * a day of it has passed, and "Expired" once `at` has come. The days are counted from a minute after `now`, which
 * the app's time may be behind by.
 */
export const expiryLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const remaining = DateTime.toEpochMillis(at) - DateTime.toEpochMillis(now)
  const days = Math.max(1, Math.ceil((remaining - clockLag) / millisPerDay))
  return remaining <= 0 ? "Expired" : `Expires in ${pluralize(days, "day", "days")}`
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

/** A group's name: a team's own, or a conversation's other members than `self`, by their names. */
export const groupName = (
  group: Group.Group,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  group.kind === "Team"
    ? group.name
    : group.memberIds
        .filter((id) => id !== self)
        .map((id) => memberName(members, id))
        .join(", ")

/** What marks `group`, named `name`, in a list: a team's `#`, or a conversation's other members' initials. */
export const groupMark = (group: Group.Group, name: string): string => (group.kind === "Team" ? "#" : initials(name))

/** Where `group` is, as a line says it: a team as `#` and its name, a conversation by the others in it. */
export const placeName = (
  group: Group.Group,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string => (group.kind === "Team" ? `#${group.name}` : groupName(group, members, self))

/**
 * Where a thread is, as the side pane's subtitle says it: "Thread in #general" for a team, "Thread in Bob" for a
 * conversation, or only "Thread" while its group is not read.
 */
export const threadSubtitle = (
  group: Option.Option<Group.Group>,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  Option.match(group, {
    onNone: () => "Thread",
    onSome: (known) => `Thread in ${placeName(known, members, self)}`
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

const deletedText = "This message was deleted."

/**
 * `text` as the runs a view shows: its words as written, and each mention as "@" and the name the member has
 * now among `members`, or the name the mention recorded while they are not among them.
 */
export const textRuns = (text: string, members: ReadonlyArray<Member.Member>): ReadonlyArray<TextRun> =>
  ThreadMessage.parts(text).map((part) =>
    ThreadMessage.Part.match(part, {
      Text: ({ text }) => ({ text }),
      Mention: ({ memberId, label }) => ({
        text: `@${members.find((member) => member.id === memberId)?.name ?? label}`,
        isMention: true
      })
    })
  )

/** What `message` says as the runs a view shows, or that it was deleted. */
export const messageRuns = (
  message: ThreadMessage.ThreadMessage,
  members: ReadonlyArray<Member.Member>
): ReadonlyArray<TextRun> =>
  ThreadMessage.Content.match(message.content, {
    Text: ({ text }) => textRuns(text, members),
    Deleted: (): ReadonlyArray<TextRun> => [{ text: deletedText }]
  })

/** What `message` says as the words a reader hears, its runs joined: a mention as "@" and the member's current name. */
export const messageWords = (message: ThreadMessage.ThreadMessage, members: ReadonlyArray<Member.Member>): string =>
  messageRuns(message, members)
    .map((run) => run.text)
    .join("")

/** `count` of something, as the person reads it: "1 member", "4 members", by its `singular` and its `plural`. */
export const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`

/** How many replies a thread has, as the person reads it: "1 reply", "4 replies". */
export const repliesLabel = (replies: number): string => pluralize(replies, "reply", "replies")

/** A thread as the person reads it in a list: its title, or its opening message as runs, or "A thread". */
export const threadRuns = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>
): ReadonlyArray<TextRun> =>
  thread.title === null
    ? Option.match(opening, {
        onNone: (): ReadonlyArray<TextRun> => [{ text: "A thread" }],
        onSome: (message) => messageRuns(message, members)
      })
    : [{ text: thread.title }]

/** A thread as the person reads it in a list, its runs joined: its title, or its opening's words, or "A thread". */
export const threadWords = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>
): string =>
  threadRuns(thread, opening, members)
    .map((run) => run.text)
    .join("")

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

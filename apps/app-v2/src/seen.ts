/**
 * What the person sees of the workspace's records: what a member and a group are called and what
 * letters mark them, who wrote a message and what it says, with a mention in it as its member's current
 * name, when a time was, by its time of day, its day, either as a message shows it, and how long ago it
 * was, how a thread is titled and how many replies it has, whether anyone may join a group, and how a
 * task's status and priority and a turn's status read.
 */

import type { Contact } from "@amends-dev/core/channel"
import type { Group } from "@amends-dev/core/group"
import type { Task } from "@amends-dev/core/task"
import { type Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Turn } from "@amends-dev/core/turn"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { TextRun } from "@amends-dev/design/message"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"

/** The uppercase first letters of the first two words of `name`, or of its first word alone. */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word).at(0) ?? "")
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

/** How many replies a thread has, as the person reads it: "1 reply", "4 replies". */
export const repliesLabel = (replies: number): string => `${replies} ${replies === 1 ? "reply" : "replies"}`

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

/** Whether anyone in the workspace may join `group`: a public team. */
export const isJoinable = (group: Group.Group): boolean => group.kind === "Team" && group.visibility === "Public"

/** A task's status, as the person reads it. */
export const statusLabel: Readonly<Record<Task.Status, string>> = {
  triage: "Triage",
  todo: "To do",
  doing: "Doing",
  held: "Held",
  done: "Done",
  dismissed: "Dismissed"
}

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

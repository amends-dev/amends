/**
 * What the person sees of the workspace's records: what a member and a group are called and what
 * letters mark them, who wrote a message and when and what it says, how a thread is titled, whether
 * anyone may join a group, and how a task's status and priority and a turn's status read.
 */

import type { Contact } from "@amends-dev/core/channel"
import type { Group } from "@amends-dev/core/group"
import type { Task } from "@amends-dev/core/task"
import { type Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Turn } from "@amends-dev/core/turn"
import type { Member, MemberId } from "@amends-dev/core/workspace"
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

/** Who wrote `message`, by their name here: a member's, or the name a channel's contact gave. */
export const authorName = (
  message: ThreadMessage.ThreadMessage,
  members: ReadonlyArray<Member.Member>,
  contacts: ReadonlyArray<Contact.Contact>
): string =>
  ThreadMessage.Author.match(message.author, {
    Member: ({ memberId }) => members.find((member) => member.id === memberId)?.name ?? "Someone",
    Contact: ({ contactId }) => contacts.find(({ id }) => id === contactId)?.name ?? "A contact"
  })

/** What `message` says, or that it was deleted. */
export const messageText = (message: ThreadMessage.ThreadMessage): string =>
  ThreadMessage.Content.match(message.content, { Text: ({ text }) => text, Deleted: () => "This message was deleted." })

/** A thread as the person reads it in a list: its title, or its opening message. */
export const threadLabel = (thread: Thread.Thread, opening: Option.Option<ThreadMessage.ThreadMessage>): string =>
  thread.title ?? Option.match(opening, { onNone: () => "A thread", onSome: messageText })

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

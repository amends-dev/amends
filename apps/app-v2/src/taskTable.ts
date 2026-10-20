/**
 * Tasks as a table, the design's `directory` rows under the labels of its columns, which a group's Tasks tab and
 * the workspace's Triage and Tasks share: a row is a task's thread by its assignee, its title, who started it and
 * how many replies it has, where the task stands, and how long ago the thread was last written in, to open it. The
 * labels go in the pane's toolbar, over the rows that scroll.
 */

import type { Contact } from "@amends-dev/core/channel"
import type { Task } from "@amends-dev/core/task"
import type { Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import { type BadgeTone, badge } from "@amends-dev/design/details"
import { columns, row } from "@amends-dev/design/directory"
import type * as DateTime from "effect/DateTime"
import type * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { ageLabel, authorName, initials, memberName, repliesLabel, statusLabel, threadWords } from "./seen.ts"

/** How a task's status shows as a badge: done a success, held a caution, and the rest quietly. */
const statusTones: Readonly<Record<Task.Status, BadgeTone>> = {
  triage: "neutral",
  todo: "neutral",
  doing: "neutral",
  held: "caution",
  done: "success",
  dismissed: "neutral"
}

/** A task to list: the thread that tracks it, with its opening, replies, and last activity, its group, and the message that opens it. */
export type TaskRow<Message> = Readonly<{
  task: Task.Task
  thread: Thread.Thread
  opening: Option.Option<ThreadMessage.ThreadMessage>
  /** How many of the thread's messages come after the opening. */
  replies: number
  /** Whether the thread is still being started. */
  pending: boolean
  lastActiveAt: DateTime.Utc
  /** Its group's name, which a table of the tasks of several groups shows in a column of its own. */
  groupName: string
  onClick: Message
}>

/** Whether the table has a column for the group of each task, which a table of several groups' tasks needs. */
export type TaskColumns = Readonly<{ hasGroupColumn: boolean }>

/**
 * What the rows are read by: the members and the contacts that name who is assigned and who started a thread,
 * the time now, which ages are counted from, and whether the table has a column for the group of each task.
 */
export type TaskTableView = TaskColumns &
  Readonly<{
    members: ReadonlyArray<Member.Member>
    contacts: ReadonlyArray<Contact.Contact>
    now: DateTime.Utc
  }>

/**
 * A task as a row, keyed by its thread: its assignee's initials, or a dash for no one, its thread's title or
 * opening, "Started by Alice · 3 replies", with "Sending…" while the thread is being started, the group when
 * the table has a column for it, a badge of the status, how long ago the thread was last written in, and "Open →".
 */
const renderRow = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  { task, thread, opening, replies, pending, lastActiveAt, groupName, onClick }: TaskRow<Message>,
  { members, contacts, now, hasGroupColumn }: TaskTableView
): Html => {
  const status = statusLabel[task.status]
  const activity = ageLabel(lastActiveAt, now)

  return h.keyed("li")(
    thread.id,
    [],
    [
      row(h, {
        mark: { text: task.assignee === null ? "–" : initials(memberName(members, task.assignee)) },
        title: threadWords(thread, opening, members),
        meta: [
          `Started by ${authorName(thread.createdBy, members, contacts)}`,
          repliesLabel(replies),
          ...(pending ? ["Sending…"] : [])
        ].join(" · "),
        cells: [
          ...(hasGroupColumn ? [h.span([], [groupName])] : []),
          badge(h, { label: status, tone: statusTones[task.status] }),
          h.span([], [activity])
        ],
        cellsText: [...(hasGroupColumn ? [groupName] : []), status, activity].join(" · "),
        action: "Open →",
        onClick
      })
    ]
  )
}

/** The labels of the columns over a list of tasks. */
export const taskColumns = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  { hasGroupColumn }: TaskColumns
): Html => columns(h, { label: "Task", cells: [...(hasGroupColumn ? ["Group"] : []), "Status", "Activity"] })

/** The list named Tasks, one row for each of `rows`. */
export const taskRows = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  rows: ReadonlyArray<TaskRow<Message>>,
  view: TaskTableView
): Html =>
  h.ul(
    [h.AriaLabel("Tasks")],
    rows.map((taskRow) => renderRow(h, taskRow, view))
  )

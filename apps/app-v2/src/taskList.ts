/**
 * Tasks as the design's task list, as `apps/ui` lists a group's tasks, which a group's Tasks tab and the workspace's
 * Triage and Tasks share: a row is a task's thread by its status, its title, its assignee, and how long ago the
 * thread was last written in, to open it, with "Sending…" in place of that while the thread is being started. The
 * labels of the columns go in the pane's toolbar, over the rows that scroll.
 */

import type { Task } from "@amends-dev/core/task"
import type { Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { MarkContent } from "@amends-dev/design/mark"
import { taskList, type TaskListRow } from "@amends-dev/design/taskList"
import type * as DateTime from "effect/DateTime"
import type * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { isOpen } from "./data/tasks.ts"
import { threadWords } from "./data/threads.ts"
import { initials, memberMark } from "./view/members.ts"
import { statusLabel, statusShape } from "./view/tasks.ts"
import { ageLabel } from "./view/time.ts"

/** What a list of tasks says where the person's filters leave none, as `apps/ui` words it. */
export const noTasksMatch = "No tasks match these filters."

/**
 * A task to list: the thread that tracks it, with its opening and last activity, and, for a list of the tasks of
 * several groups, the place its group is as a line says it, which follows its title. A row `isCurrent` while its
 * thread is the one open beside the list.
 */
export type TaskRow<Message> = Readonly<{
  task: Task.Task
  thread: Thread.Thread
  opening: Option.Option<ThreadMessage.ThreadMessage>
  /** Whether the thread is still being started. */
  pending: boolean
  lastActiveAt: DateTime.Utc
  place?: string | undefined
  isCurrent?: boolean | undefined
  onClick: Message
}>

/** What the rows are read by: the members that name who is assigned, and the time now, which ages are counted from. */
export type TaskRowsView = Readonly<{ members: ReadonlyArray<Member.Member>; now: DateTime.Utc }>

/** The member a task is assigned to as the list shows them, by name and mark, or by their ID until names are read. */
const assigneeOf = (
  members: ReadonlyArray<Member.Member>,
  assignee: MemberId.MemberId
): Readonly<{ name: string; mark: MarkContent }> => {
  const member = members.find(({ id }) => id === assignee)

  return member === undefined
    ? { name: assignee, mark: { text: initials(assignee) } }
    : { name: member.name, mark: memberMark(member) }
}

/**
 * A task as the design's list row, keyed by its thread: its status drawn and said, its thread's title or opening, quiet
 * once the task is done or dismissed, its group's place when it has one, its assignee if it has one, and how long ago
 * the thread was last written in, or "Sending…" while it is being started.
 */
const listRowOf = <Message>(
  { task, thread, opening, pending, lastActiveAt, place, isCurrent, onClick }: TaskRow<Message>,
  { members, now }: TaskRowsView
): TaskListRow<Message> => ({
  key: thread.id,
  title: threadWords(thread, opening, members),
  status: { shape: statusShape[task.status], label: statusLabel[task.status] },
  isFinished: !isOpen(task.status),
  place,
  assignee: task.assignee === null ? undefined : assigneeOf(members, task.assignee),
  activity: pending ? "Sending…" : ageLabel(lastActiveAt, now),
  isCurrent,
  onClick
})

/** The list named Tasks, one row for each of `rows`. */
export const taskRows = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  rows: ReadonlyArray<TaskRow<Message>>,
  view: TaskRowsView
): Html =>
  taskList(
    h,
    rows.map((row) => listRowOf(row, view))
  )

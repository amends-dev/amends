/**
 * The tasks the person can see across the workspace, as the sidebar's Triage and Tasks list them: Triage, the
 * tasks in triage, which wait for someone to decide on them, and Tasks, every task that is neither done nor
 * dismissed, each as a list of tasks under a toolbar of a search and the menus of assignee and status that narrow
 * it. The task's controls are in its thread, in its group, so the Block writes nothing and reports the thread the
 * person opens.
 */

import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import { isOpen } from "../../data/tasks.ts"
import { threadContains } from "../../seen.ts"
import { AssigneeFilter, AssigneeMenu, isAssignedTo, StatusFilterMenu, TaskStatusFilter } from "../../taskFilter.ts"

/**
 * A task, the thread that tracks it with its opening message, the place its group is as a line says it, when the
 * thread was last active, and whether it is still being started.
 */
export const TaskItem = Schema.Struct({
  task: Task.Task,
  thread: Thread.Thread,
  place: Schema.String,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  pending: Schema.Boolean,
  lastActiveAt: Schema.DateTimeUtc
})
export type TaskItem = typeof TaskItem.Type

/**
 * The tasks as they were read, the members that name who is assigned to them, what the list is narrowed to and
 * the menus it is chosen in, and why the last read failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  items: Schema.Array(TaskItem),
  members: Schema.Array(Member.Member),
  filter: Schema.Struct({ status: TaskStatusFilter, assignee: AssigneeFilter, query: Schema.String }),
  statusMenu: StatusFilterMenu.Model,
  assigneeMenu: AssigneeMenu.Model,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedTasks: { items: Schema.Array(TaskItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  FailedRead: { error: Schema.String },
  TypedQuery: { query: Schema.String },
  ClickedTask: { groupId: GroupId.GroupId, threadId: ThreadId.ThreadId }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedThread: { groupId: GroupId.GroupId, threadId: ThreadId.ThreadId }
})
export type OutMessage = typeof OutMessage.Type

export const TasksDefinition = Block.makeDefinition("Tasks", { Model, Message, OutMessage })

/** The tasks of `items` in triage, which wait for a decision. */
export const triageTasks = (items: ReadonlyArray<TaskItem>): ReadonlyArray<TaskItem> =>
  items.filter(({ task }) => task.status === "triage")

/** The tasks of `items` that are neither done nor dismissed. */
export const openTasks = (items: ReadonlyArray<TaskItem>): ReadonlyArray<TaskItem> =>
  items.filter(({ task }) => isOpen(task.status))

/** How many of `items` are in triage. */
export const triageCount = (items: ReadonlyArray<TaskItem>): number => triageTasks(items).length

const byLastActive = Order.mapInput(Order.flip(DateTime.Order), ({ lastActiveAt }: TaskItem) => lastActiveAt)

/**
 * The tasks of `items` the filter keeps, latest active first: those in the status it chose, every one for All,
 * assigned as it chose, and whose thread's title or opening contains what it searches for, in any case and
 * whatever the accents, all of them for no letters.
 */
export const matching = (model: Model, items: ReadonlyArray<TaskItem>): ReadonlyArray<TaskItem> => {
  const { status, assignee, query } = model.filter

  return Array.sort(items, byLastActive).filter(
    ({ task, thread, opening }) =>
      (status === "All" || task.status === status) &&
      isAssignedTo(assignee, task.assignee) &&
      threadContains(thread, opening, model.members, query)
  )
}

/** Whether the person narrowed the list: they searched for letters, or chose an assignee or a status. */
export const isFiltered = ({ filter }: Model): boolean =>
  filter.query.trim() !== "" || !AssigneeFilter.isAnyOf(["Anyone"])(filter.assignee) || filter.status !== "All"

/** The model with every status chosen, for a list that has no choice of status to show what a status leaves out. */
export const withAnyStatus = (model: Model): Model =>
  modifyFields(model, { filter: (filter) => modifyFields(filter, { status: () => "All" as const }) })

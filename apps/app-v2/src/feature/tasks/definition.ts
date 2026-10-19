/**
 * The tasks the person can see across the workspace, as the sidebar's Triage and Tasks list them: Triage, the
 * tasks in triage, which wait for someone to decide on them, and Tasks, every task that is neither done nor
 * dismissed, each as a table under a search and the choices of assignee and status that narrow it. The task's
 * controls are in its thread, in its group, so the Block writes nothing and reports the thread the person opens.
 */

import { Contact } from "@amends-dev/core/channel"
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
import { isOpen, threadContains } from "../../seen.ts"
import { TaskStatusFilter } from "../threads/definition.ts"

/**
 * A task, the thread that tracks it with its opening message, its group's name, how many messages follow the
 * opening, when the thread was last active, and whether it is still being started.
 */
export const TaskItem = Schema.Struct({
  task: Task.Task,
  thread: Thread.Thread,
  groupName: Schema.String,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  replies: Schema.Int,
  pending: Schema.Boolean,
  lastActiveAt: Schema.DateTimeUtc
})
export type TaskItem = typeof TaskItem.Type

/** Which tasks the list keeps by who they are assigned to: any, the person's own, or those assigned to no one. */
export const AssigneeFilter = Schema.Literals(["Anyone", "Me", "NoOne"])
export type AssigneeFilter = typeof AssigneeFilter.Type

/**
 * The tasks as they were read, the members and the contacts that name who started a thread and who is assigned
 * to it, what the list is narrowed to, and why the last read failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  items: Schema.Array(TaskItem),
  members: Schema.Array(Member.Member),
  contacts: Schema.Array(Contact.Contact),
  filter: Schema.Struct({ status: TaskStatusFilter, assignee: AssigneeFilter, query: Schema.String }),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedTasks: { items: Schema.Array(TaskItem) },
  ReceivedPeople: { members: Schema.Array(Member.Member), contacts: Schema.Array(Contact.Contact) },
  FailedRead: { error: Schema.String },
  ChoseStatus: { status: TaskStatusFilter },
  ChoseAssignee: { assignee: AssigneeFilter },
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

/** Whether a task assigned to `assignee` is one the person, `self`, wants, by what they chose to see. */
const assignedAs: Readonly<
  Record<AssigneeFilter, (assignee: MemberId.MemberId | null, self: MemberId.MemberId) => boolean>
> = {
  Anyone: () => true,
  Me: (assignee, self) => assignee === self,
  NoOne: (assignee) => assignee === null
}

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
      assignedAs[assignee](task.assignee, model.memberId) &&
      threadContains(thread, opening, model.members, query)
  )
}

/** Whether the person narrowed the list: they searched for letters, or chose an assignee or a status. */
export const isFiltered = ({ filter }: Model): boolean =>
  filter.query.trim() !== "" || filter.assignee !== "Anyone" || filter.status !== "All"

/** The model with every status chosen, for a list that has no choice of status to show what a status leaves out. */
export const withAnyStatus = (model: Model): Model =>
  modifyFields(model, { filter: (filter) => modifyFields(filter, { status: () => "All" as const }) })

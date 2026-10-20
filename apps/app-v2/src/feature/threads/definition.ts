/**
 * A group's threads, as the person lists them on a tab each: all of them, oldest first under the days they
 * were created, each with its opening message, who replied to it, the task it tracks, and how much of it is
 * new; and the ones that track a task, latest active first, as a table the person narrows by status and by what
 * they search for. A composer starts a thread, or on the Tasks tab a thread that tracks a task, which the Tasks tab's
 * New task moves the focus to. It reports the thread the person picks.
 */

import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { type Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { type Day, groupByDay, isOpen, threadContains } from "../../seen.ts"
import { TaskStatusFilter } from "../../taskFilter.ts"
import { ComposerBlock } from "../composer/block.ts"

/**
 * A thread of the group, with its opening message, its task, how many messages follow the opening and who wrote
 * them, when it was last active, whether it is still being started, and how much is unread.
 */
export const ThreadItem = Schema.Struct({
  thread: Thread.Thread,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  task: Schema.Option(Task.Task),
  replies: Schema.Int,
  repliers: Schema.Array(ThreadMessage.Author),
  lastActiveAt: Schema.DateTimeUtc,
  pending: Schema.Boolean,
  unread: Schema.Int
})
export type ThreadItem = typeof ThreadItem.Type

/** The tabs of the group's threads: all of them, and the ones that track a task. */
export const ThreadsTab = Schema.Literals(["Threads", "Tasks"])
export type ThreadsTab = typeof ThreadsTab.Type

/**
 * The group's threads as they were read, whether they were yet, the tab shown, what the Tasks tab is narrowed to, the
 * composer, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId,
  threads: Schema.Array(ThreadItem),
  isLoaded: Schema.Boolean,
  tab: ThreadsTab,
  taskFilter: Schema.Struct({ status: TaskStatusFilter, query: Schema.String }),
  composer: ComposerBlock.Model,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

/** What the composer is made from: the group it starts threads in, as the member. */
export const ChildInitContext = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId
})

export const Message = defineMessageUnion({
  ReceivedThreads: { threads: Schema.Array(ThreadItem) },
  FailedRead: { error: Schema.String },
  ChoseTab: { tab: ThreadsTab },
  ChoseTaskStatus: { status: TaskStatusFilter },
  TypedTaskQuery: { query: Schema.String },
  ClickedNewTask: {},
  CompletedFocusComposer: {},
  ClickedThread: { threadId: ThreadId.ThreadId },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SelectedThread: { threadId: ThreadId.ThreadId }
})
export type OutMessage = typeof OutMessage.Type

export const ThreadsDefinition = Block.makeDefinition("Threads", { Model, Message, OutMessage, ChildInitContext })

const byCreated = Order.mapInput(DateTime.Order, ({ thread }: ThreadItem) => thread.createdAt)

/**
 * `items` oldest first by when their threads were created, as the days they were created on by the person's own
 * clock, each named as it is from `now`: "Today", "Yesterday", a weekday, or a date.
 */
export const byDay = (items: ReadonlyArray<ThreadItem>, now: DateTime.Utc): ReadonlyArray<Day<ThreadItem>> =>
  groupByDay(Array.sort(items, byCreated), ({ thread }) => thread.createdAt, now)

/** A thread of the group and the task it tracks. */
export type TrackingThread = Readonly<{ item: ThreadItem; task: Task.Task }>

const byLastActive = Order.mapInput(Order.flip(DateTime.Order), ({ item }: TrackingThread) => item.lastActiveAt)

/**
 * The threads that track a task, latest active first, kept to the status the filter chose, every one for All, and
 * to those whose title or opening contains what the filter searches for, in any case and whatever the accents,
 * all of them for no letters.
 */
export const tasksOf = (model: Model, members: ReadonlyArray<Member.Member>): ReadonlyArray<TrackingThread> => {
  const { status, query } = model.taskFilter
  const tracked = model.threads.flatMap((item) => Option.toArray(Option.map(item.task, (task) => ({ item, task }))))

  return Array.sort(tracked, byLastActive).filter(
    ({ item, task }) =>
      (status === "All" || task.status === status) && threadContains(item.thread, item.opening, members, query)
  )
}

/** How many of `items` track a task that is neither done nor dismissed. */
export const openTaskCount = (items: ReadonlyArray<ThreadItem>): number =>
  items.filter(({ task }) => Option.exists(task, ({ status }) => isOpen(status))).length

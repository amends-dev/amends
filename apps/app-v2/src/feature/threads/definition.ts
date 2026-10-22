/**
 * A group's threads, as the person lists them on a tab each: all of them, oldest first under the days they were
 * created, each with its opening message, who replied to it, the task it tracks, and how much of it is new; and the
 * ones that track a task, as a table the person narrows by status, by assignee, and by what they search for, and sorts
 * by latest activity or by when the thread was started. A composer starts a thread, or on the Tasks tab a thread that
 * tracks a task, which the Tasks tab's New task moves the focus to. It reports the thread the person picks, the
 * slash command they run in the composer, and the member whose card they open from the name or mark of a thread's
 * author or a mention in its opening.
 */

import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { type Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Menu from "@foldkit/ui/menu"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { AgentAtWork } from "../../data/agents.ts"
import { isOpen } from "../../data/tasks.ts"
import { type Day, groupByDay, isStackedUnder, type Stackable, threadContains } from "../../seen.ts"
import { AssigneeFilter, AssigneeMenu, isAssignedTo, StatusFilterMenu, TaskStatusFilter } from "../../taskFilter.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SlashCommand } from "../composer/definition.ts"

/**
 * A thread of the group, with its opening message, its task, how many messages follow the opening and who wrote
 * them, which agents are at work in it, when it was last active, whether it is still being started, and how much is
 * unread.
 */
export const ThreadItem = Schema.Struct({
  thread: Thread.Thread,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  task: Schema.Option(Task.Task),
  replies: Schema.Int,
  repliers: Schema.Array(ThreadMessage.Author),
  working: Schema.Array(AgentAtWork),
  lastActiveAt: Schema.DateTimeUtc,
  pending: Schema.Boolean,
  unread: Schema.Int
})
export type ThreadItem = typeof ThreadItem.Type

/** The tabs of the group's threads: all of them, and the ones that track a task. */
export const ThreadsTab = Schema.Literals(["Threads", "Tasks"])
export type ThreadsTab = typeof ThreadsTab.Type

/**
 * How the Tasks tab orders its tasks: by latest activity, or by when their threads were started, newest or oldest
 * first.
 */
export const TaskSort = Schema.Literals(["Latest", "Newest", "Oldest"])
export type TaskSort = typeof TaskSort.Type

/** The menu that chooses how the Tasks tab orders its tasks. */
export const TaskSortMenu = Menu.create<TaskSort>()

/** The orders of the Tasks tab, as the person reads them. */
export const taskSortChoices: ReadonlyArray<readonly [TaskSort, string]> = [
  ["Latest", "Latest activity"],
  ["Newest", "Newest"],
  ["Oldest", "Oldest"]
]

/**
 * The group's threads as they were read, whether they were yet, the tab shown, what the Tasks tab is narrowed to, how
 * it is ordered, and the menus those are chosen in, the composer, how many times the person asked to read the
 * threads again, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId,
  threads: Schema.Array(ThreadItem),
  isLoaded: Schema.Boolean,
  tab: ThreadsTab,
  taskFilter: Schema.Struct({ status: TaskStatusFilter, assignee: AssigneeFilter, query: Schema.String }),
  taskSort: TaskSort,
  statusMenu: StatusFilterMenu.Model,
  assigneeMenu: AssigneeMenu.Model,
  sortMenu: TaskSortMenu.Model,
  composer: ComposerBlock.Model,
  reads: Schema.Int,
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
  ClickedTryAgain: {},
  ChoseTab: { tab: ThreadsTab },
  TypedTaskQuery: { query: Schema.String },
  ClickedNewTask: {},
  CompletedFocusComposer: {},
  CompletedScrollThreadsToEnd: {},
  ClickedThread: { threadId: ThreadId.ThreadId },
  OpenedProfile: { memberId: Schema.String, triggerId: Schema.String },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SelectedThread: { threadId: ThreadId.ThreadId },
  RanSlashCommand: { command: SlashCommand },
  OpenedProfile: { memberId: Schema.String, triggerId: Schema.String }
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

/**
 * What a thread's opening is to the thread before it when they stack: who wrote it, when the thread began, and replies.
 */
const stackableOf = (item: ThreadItem): Option.Option<Stackable> =>
  Option.map(item.opening, ({ author }) => ({
    author,
    at: item.thread.createdAt,
    hasReplies: item.replies > 0
  }))

/**
 * Whether the opening of `item` stacks under the opening of `previous`, the thread just before it within a day, as the
 * timeline stacks messages: see `isStackedUnder`. An opening not yet read stacks under none and none stacks under it.
 */
export const openingStacksUnder = (item: ThreadItem, previous: ThreadItem | undefined): boolean =>
  Option.exists(stackableOf(item), (stackable) =>
    isStackedUnder(stackable, Option.getOrUndefined(Option.flatMap(Option.fromUndefinedOr(previous), stackableOf)))
  )

/** The `id` of the list of the threads of `groupId`, which the scroll that keeps it at its end finds it by. */
export const threadsListId = (groupId: GroupId.GroupId): string => `group-threads-${groupId}`

/**
 * Whether the pane shows the group's threads as a conversation, which rests against its end: the Threads tab, once
 * the threads are read, while there are any.
 */
export const showsConversation = (model: Model): boolean =>
  model.tab === "Threads" && model.isLoaded && model.threads.length > 0

const memberNamesList = new Intl.ListFormat("en", { style: "long", type: "conjunction" })

/** What the welcome calls the person among the members' names. */
export const selfName = "You"

/**
 * Who belongs to a team as its welcome says it, from `names`: "You, Alex Morgan, and Sara are members.", "You and Sara
 * are members.", and for one "You are a member." or "Sara is a member.".
 */
export const membersLine = (names: ReadonlyArray<string>): string => {
  if (names.length !== 1) {
    return `${memberNamesList.format(names)} are members.`
  }

  return names[0] === selfName ? `${selfName} are a member.` : `${names[0]} is a member.`
}

/** Whether the threads could not be read, which is why none are shown: nothing was read, and why. */
export const isReadFailed = (model: Model): boolean => !model.isLoaded && Option.isSome(model.notice)

/** A thread of the group and the task it tracks. */
export type TrackingThread = Readonly<{ item: ThreadItem; task: Task.Task }>

const taskOrder: Readonly<Record<TaskSort, Order.Order<TrackingThread>>> = {
  Latest: Order.mapInput(Order.flip(DateTime.Order), ({ item }) => item.lastActiveAt),
  Newest: Order.flip(Order.mapInput(byCreated, ({ item }) => item)),
  Oldest: Order.mapInput(byCreated, ({ item }) => item)
}

/**
 * The threads that track a task, kept to the status the filter chose, every one for All, to those assigned as it
 * chose, and to those whose title or opening contains what it searches for, in any case and whatever the accents,
 * all of them for no letters, in the order the person chose.
 */
export const tasksOf = (model: Model, members: ReadonlyArray<Member.Member>): ReadonlyArray<TrackingThread> => {
  const { status, assignee, query } = model.taskFilter
  const tracked = model.threads.flatMap((item) => Option.toArray(Option.map(item.task, (task) => ({ item, task }))))

  return Array.sort(tracked, taskOrder[model.taskSort]).filter(
    ({ item, task }) =>
      (status === "All" || task.status === status) &&
      isAssignedTo(assignee, task.assignee) &&
      threadContains(item.thread, item.opening, members, query)
  )
}

/** Whether the person narrowed the tasks: they searched for letters, or chose an assignee or a status. */
export const isFiltered = ({ taskFilter }: Model): boolean =>
  taskFilter.query.trim() !== "" ||
  !AssigneeFilter.isAnyOf(["Anyone"])(taskFilter.assignee) ||
  taskFilter.status !== "All"

/** How many of `items` track a task that is neither done nor dismissed. */
export const openTaskCount = (items: ReadonlyArray<ThreadItem>): number =>
  items.filter(({ task }) => Option.exists(task, ({ status }) => isOpen(status))).length

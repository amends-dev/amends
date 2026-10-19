/**
 * A group's threads, as the person lists them, oldest first under the days they were created on: each with
 * its opening message, who replied to it, the task it tracks, and how much of it is new, and a composer to
 * start one. It reports the thread the person picks.
 */

import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { dayLabel, dayOf } from "../../seen.ts"
import { ComposerBlock } from "../composer/block.ts"

/**
 * A thread of the group, with its opening message, its task, how many messages follow the opening and who wrote
 * them, whether it is still being started, and how much is unread.
 */
export const ThreadItem = Schema.Struct({
  thread: Thread.Thread,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  task: Schema.Option(Task.Task),
  replies: Schema.Int,
  repliers: Schema.Array(ThreadMessage.Author),
  pending: Schema.Boolean,
  unread: Schema.Int
})
export type ThreadItem = typeof ThreadItem.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId,
  threads: Schema.Array(ThreadItem),
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

/** The threads created on one local day, oldest first, under what that day is called. */
export type ThreadDay = Readonly<{ label: string; items: ReadonlyArray<ThreadItem> }>

const byCreated = Order.mapInput(DateTime.Order, ({ thread }: ThreadItem) => thread.createdAt)

/**
 * `items` oldest first by when their threads were created, as the days they were created on by the person's own
 * clock, each named as it is from `now`: "Today", "Yesterday", a weekday, or a date.
 */
export const byDay = (items: ReadonlyArray<ThreadItem>, now: DateTime.Utc): ReadonlyArray<ThreadDay> => {
  const dated = Array.sort(items, byCreated).map((item) => ({ item, day: dayOf(item.thread.createdAt) }))

  return Array.isReadonlyArrayNonEmpty(dated)
    ? Array.groupWith(dated, (a, b) => DateTime.Equivalence(a.day, b.day)).map((run) => ({
        label: dayLabel(run[0].day, now),
        items: run.map(({ item }) => item)
      }))
    : []
}

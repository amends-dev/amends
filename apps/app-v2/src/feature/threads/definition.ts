/**
 * A group's threads, as the person lists them: each with its opening message, the task it tracks,
 * and how much of it is new, and a composer to start one. It reports the thread the person picks.
 */

import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { ComposerBlock } from "../composer/block.ts"

/** A thread of the group, with its opening message, its task, whether it is still being started, and how much is unread. */
export const ThreadItem = Schema.Struct({
  thread: Thread.Thread,
  opening: Schema.Option(ThreadMessage.ThreadMessage),
  task: Schema.Option(Task.Task),
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

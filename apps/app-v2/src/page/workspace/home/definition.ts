/**
 * Home, the rail's first destination in a workspace: the person's inbox, the tasks in triage and every open task, and
 * the groups to browse or to open, each in the main pane, with a group's threads and the thread open among them, and
 * a conversation the person has not started, as it will be, until they send its first message. The sidebar lists the
 * inbox, the triage, the tasks, and the groups. A thread opens in the side pane, beside the group's threads or beside
 * the inbox, which stays, and the Block lays the pane out by the window's width, which its parent informs it of: below
 * 80rem the pane is in a dialog of its own, which follows the thread opening and closing. It reports when the person
 * moved within Home from its sidebar or its lists, when they joined a group, with where it is as a line says it, when
 * they created one, when they asked, from a turn that failed in a thread, for the settings of its agent, when they asked,
 * from a group's header on a phone, for the search, and its
 * parent asks it to open a group, a thread in its group, or a conversation with a member, which is the one they have or
 * one not started, and to show the inbox again, as leaving Home does. Home opens on the inbox.
 */

import { GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import type { Task } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { Viewport } from "@amends-dev/design/viewport"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { GroupBlock } from "../../../feature/group/block.ts"
import { GroupsBlock } from "../../../feature/groups/block.ts"
import { InboxBlock } from "../../../feature/inbox/block.ts"
import { TasksBlock } from "../../../feature/tasks/block.ts"
import { type Model as ThreadModel, titleOf } from "../../../feature/thread/definition.ts"
import { UnsentConversationBlock } from "../../../feature/unsentConversation/block.ts"
import { soleMemberId } from "../../../feature/unsentConversation/definition.ts"

/**
 * What Home's main pane shows: the inbox, the tasks in triage, every open task, the groups to browse, the group open,
 * with the thread open in it, or a conversation the person has not started.
 */
export const Open = defineTaggedUnion({
  Inbox: {},
  Triage: {},
  Tasks: {},
  Groups: {},
  Group: { groupId: GroupId.GroupId, model: GroupBlock.Model },
  Unsent: { model: UnsentConversationBlock.Model }
})
export type Open = typeof Open.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  /** The window's width, which the side pane follows. */
  viewport: Viewport,
  groups: GroupsBlock.Model,
  inbox: InboxBlock.Model,
  tasks: TasksBlock.Model,
  open: Open,
  /** The thread's side pane, a dialog, which the shell shows only below 80rem. */
  aside: DialogBlock.Model
})
export type Model = typeof Model.Type

/** The status of the task `thread` tracks, while it tracks one. */
const taskStatusOf = (thread: ThreadModel): Option.Option<Task.Status> =>
  Option.map(thread.task.task, ({ task }) => task.status)

/** The title of the thread open, in the group open or beside the inbox, while there is one. */
export const openThreadTitle = (model: Model): Option.Option<string> =>
  Open.matchOrElse(
    model.open,
    {
      Inbox: () => Option.map(model.inbox.selected, ({ model: thread }) => titleOf(thread)),
      Group: ({ model: group }) => Option.map(group.thread, ({ model: thread }) => titleOf(thread))
    },
    () => Option.none()
  )

/**
 * The status of the task the thread open tracks, in the group open or beside the inbox, while there is a thread open
 * that tracks one.
 */
export const openThreadTaskStatus = (model: Model): Option.Option<Task.Status> =>
  Open.matchOrElse(
    model.open,
    {
      Inbox: () => Option.flatMap(model.inbox.selected, ({ model: thread }) => taskStatusOf(thread)),
      Group: ({ model: group }) => Option.flatMap(group.thread, ({ model: thread }) => taskStatusOf(thread))
    },
    () => Option.none()
  )

/** The member the conversation not started is with, when one is open and it is with one alone. */
export const unsentMemberId = (model: Model): Option.Option<MemberId.MemberId> =>
  Open.matchOrElse(model.open, { Unsent: ({ model: unsent }) => soleMemberId(unsent) }, () => Option.none())

/** Whether a thread is open, in the group open or beside the inbox, which shows the side pane. */
export const isThreadOpen = (model: Model): boolean => Option.isSome(openThreadTitle(model))

/** What the groups, the inbox, and the tasks are made from: the workspace, as the member. */
export const ChildInitContext = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId })

export const Message = defineMessageUnion({
  ClickedInbox: {},
  ClickedTriage: {},
  ClickedTasks: {},
  RequestedReset: {},
  RequestedOpenGroup: { groupId: GroupId.GroupId },
  RequestedOpenThread: { groupId: GroupId.GroupId, threadId: ThreadId.ThreadId },
  RequestedConversationWith: { memberId: MemberId.MemberId },
  InformedOfViewport: { viewport: Viewport }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  Navigated: {},
  JoinedGroup: { groupId: GroupId.GroupId, place: Schema.String },
  CreatedGroup: { groupId: GroupId.GroupId },
  OpenedAgent: { agentId: Identity.AgentId },
  FollowedGroup: { place: Schema.String },
  UnfollowedGroup: { place: Schema.String },
  RequestedSearch: {}
})
export type OutMessage = typeof OutMessage.Type

export const HomeDefinition = Block.makeDefinition("Home", { Model, Message, OutMessage, ChildInitContext })

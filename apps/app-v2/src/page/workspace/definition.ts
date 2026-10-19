/**
 * A workspace the person opened, as their member of it: its groups to pick from, their unfinished
 * actions, and the open group's threads, with the open thread among them. It reports when the
 * person leaves it.
 */

import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { ThreadBlock } from "../../feature/thread/block.ts"
import { ThreadsBlock } from "../../feature/threads/block.ts"

/** The thread open in the group. */
export const OpenThread = Schema.Struct({ threadId: ThreadId.ThreadId, model: ThreadBlock.Model })
export type OpenThread = typeof OpenThread.Type

/** The group open in the workspace: its threads, and the thread open among them. */
export const Pane = Schema.Struct({
  groupId: GroupId.GroupId,
  threads: ThreadsBlock.Model,
  thread: Schema.Option(OpenThread)
})
export type Pane = typeof Pane.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  name: Schema.String,
  groups: GroupsBlock.Model,
  actions: ActionsBlock.Model,
  pane: Schema.Option(Pane)
})
export type Model = typeof Model.Type

/** What the groups and actions are made from: the workspace, as the member. */
export const ChildInitContext = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId })

export const Message = defineMessageUnion({
  ClickedAllWorkspaces: {},
  ClickedAllThreads: {}
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ClosedWorkspace: {}
})
export type OutMessage = typeof OutMessage.Type

export const WorkspaceDefinition = Block.makeDefinition("Workspace", { Model, Message, OutMessage, ChildInitContext })

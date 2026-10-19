/**
 * A workspace the person opened, as their member of it: its groups to pick from, their unfinished
 * actions, and the open group, with its threads and the thread open among them. It reports when
 * the person leaves it.
 */

import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"

/** The group open in the workspace. */
export const OpenGroup = Schema.Struct({ groupId: GroupId.GroupId, model: GroupBlock.Model })
export type OpenGroup = typeof OpenGroup.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  name: Schema.String,
  groups: GroupsBlock.Model,
  actions: ActionsBlock.Model,
  group: Schema.Option(OpenGroup)
})
export type Model = typeof Model.Type

/** What the groups and actions are made from: the workspace, as the member. */
export const ChildInitContext = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId })

export const Message = defineMessageUnion({
  ClickedAllWorkspaces: {}
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ClosedWorkspace: {}
})
export type OutMessage = typeof OutMessage.Type

export const WorkspaceDefinition = Block.makeDefinition("Workspace", { Model, Message, OutMessage, ChildInitContext })

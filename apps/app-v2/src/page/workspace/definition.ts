/**
 * A workspace the person opened, as their member of it: its groups to pick from, their unfinished
 * actions, their inbox, their connections, their settings, and their channels, and what the main
 * content shows: nothing yet, the inbox, the connections, the settings, the channels, or a group,
 * with its threads and the thread open among them. It reports when the person leaves it.
 */

import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"

/**
 * What the main content shows: nothing yet, the inbox, the connections, the settings, the channels,
 * or the group open in the workspace.
 */
export const Open = defineTaggedUnion({
  Nothing: {},
  Inbox: {},
  Connections: {},
  Settings: {},
  Channels: {},
  Group: { groupId: GroupId.GroupId, model: GroupBlock.Model }
})
export type Open = typeof Open.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  name: Schema.String,
  groups: GroupsBlock.Model,
  actions: ActionsBlock.Model,
  inbox: InboxBlock.Model,
  connections: ConnectionsBlock.Model,
  settings: SettingsBlock.Model,
  channels: ChannelsBlock.Model,
  open: Open
})
export type Model = typeof Model.Type

/** What the groups, actions, inbox, connections, settings, and channels are made from: the workspace, as the member. */
export const ChildInitContext = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId })

export const Message = defineMessageUnion({
  ClickedAllWorkspaces: {},
  ClickedInbox: {},
  ClickedConnections: {},
  ClickedSettings: {},
  ClickedChannels: {}
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ClosedWorkspace: {}
})
export type OutMessage = typeof OutMessage.Type

export const WorkspaceDefinition = Block.makeDefinition("Workspace", { Model, Message, OutMessage, ChildInitContext })

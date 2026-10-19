/**
 * A workspace the person opened, as their member of it: its groups to pick from, their unfinished
 * actions, their inbox, their connections, their agents, their settings, and their channels, and
 * what the main content shows: nothing yet, the inbox, the connections, the agents, the settings,
 * the channels, or a group, with its threads and the thread open among them, and whether the
 * navigation drawer is open, which every navigation closes. It lists the host's integrations once,
 * as it opens, informs the connections, the agents, and the channels of them, and lists them again
 * when one asks. It reports when the person leaves it, and when they ask to sign out.
 */

import { Connection } from "@amends-dev/core/connection"
import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { titleOf } from "../../feature/thread/definition.ts"

/**
 * What the main content shows: nothing yet, the inbox, the connections, the agents, the settings,
 * the channels,
 * or the group open in the workspace.
 */
export const Open = defineTaggedUnion({
  Nothing: {},
  Inbox: {},
  Connections: {},
  Agents: {},
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
  agents: AgentsBlock.Model,
  settings: SettingsBlock.Model,
  channels: ChannelsBlock.Model,
  open: Open,
  /** Whether the navigation drawer is open, which only shows below 64rem. */
  isMenuOpen: Schema.Boolean
})
export type Model = typeof Model.Type

/** The title of the thread open in the group open, while there is one. */
export const openThreadTitle = (open: Open): Option.Option<string> =>
  Open.matchOrElse(
    open,
    { Group: ({ model }) => Option.map(model.thread, ({ model: thread }) => titleOf(thread)) },
    () => Option.none()
  )

/** What the groups, actions, inbox, connections, agents, settings, and channels are made from: the workspace, as the member. */
export const ChildInitContext = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId })

export const Message = defineMessageUnion({
  ClickedAllWorkspaces: {},
  ClickedSignOut: {},
  ClickedHome: {},
  ClickedInbox: {},
  ClickedConnections: {},
  ClickedAgents: {},
  ClickedSettings: {},
  ClickedChannels: {},
  ClickedMenu: {},
  ClickedCloseMenu: {},
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ClosedWorkspace: {},
  RequestedSignOut: {}
})
export type OutMessage = typeof OutMessage.Type

export const WorkspaceDefinition = Block.makeDefinition("Workspace", { Model, Message, OutMessage, ChildInitContext })

/**
 * A workspace the person opened, as their member of it: Home, which holds its groups, their inbox, and the tasks they
 * can see, their unfinished actions, their connections, their agents, their settings, and their channels, and what
 * the main content shows: Home, the connections, one connection, the agents, one agent, a page of the settings, or the
 * channels. A member opens in the side pane, beside the settings' Members. The rail picks a destination, and the
 * sidebar lists that destination's items: Home's inbox, tasks, and groups, the agents, the connections by what they
 * give and the channels, or the settings' Workspace and Members. It lays itself out by the window's width, which its
 * parent informs it of: below 64rem the sidebar and the rail are in a navigation drawer, a dialog that opening an item
 * closes and picking a destination on the rail does not, so the person sees that destination's sidebar, and below
 * 80rem the side pane, which Home's thread and the settings' member are shown in, is in a dialog of its own, which
 * follows what it shows opening and closing. It lists the host's integrations once, as it opens, informs the
 * connections, the agents, and the channels of them, and lists them again when one asks. Its search, in a dialog over
 * the page, opens from the sidebar and when its parent asks, and what it finds opens a group, a thread in its group,
 * or a conversation with a member, in Home. Its rail ends with the person's account, which the settings draw: a menu
 * of their Appearance, the way to another workspace, the workspace's settings, a dialog that changes their name, which
 * the settings open, and signing out. It reports when the person leaves it, and every other entry they choose, which
 * the app acts on; the workspace's settings show when the app asks.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { Identity } from "@amends-dev/core/identity"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { Viewport } from "@amends-dev/design/viewport"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { SearchBlock } from "../../feature/search/block.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { ReportedAccountEntry, workspaceName } from "../../feature/settings/definition.ts"
import { HomeBlock } from "./home/block.ts"

/** The pages of the settings, each of which the sidebar lists: the workspace's own, and its members. */
export const SettingsPage = Schema.Literals(["Workspace", "Members"])
export type SettingsPage = typeof SettingsPage.Type

/**
 * What the main content shows: Home, the connections or one connection among them, the agents or one agent among
 * them, a page of the settings with the member open beside it, or the channels. The member is part of what is open, so
 * that going to another page or destination leaves it.
 */
export const Open = defineTaggedUnion({
  Home: {},
  Connections: {},
  Connection: { connectionId: ConnectionContract.ConnectionId },
  Agents: {},
  Agent: { agentId: Identity.AgentId },
  Settings: { page: SettingsPage, memberId: Schema.Option(MemberId.MemberId) },
  Channels: {}
})
export type Open = typeof Open.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  name: Schema.String,
  home: HomeBlock.Model,
  actions: ActionsBlock.Model,
  connections: ConnectionsBlock.Model,
  agents: AgentsBlock.Model,
  settings: SettingsBlock.Model,
  channels: ChannelsBlock.Model,
  search: SearchBlock.Model,
  open: Open,
  /** The window's width, which the layout follows. */
  viewport: Viewport,
  /** The navigation drawer, a dialog, which the shell shows only below 64rem. */
  menu: DialogBlock.Model,
  /** The side pane of the settings' member, a dialog, which the shell shows only below 80rem. */
  aside: DialogBlock.Model
})
export type Model = typeof Model.Type

/**
 * The workspace's name as the person sees it: the one the settings hold, which follows a rename, once the
 * replica has the workspace, and the one it was opened with until then.
 */
export const nameOf = (model: Model): string => {
  const settingsName = workspaceName(model.settings)
  return settingsName === "" ? model.name : settingsName
}

/** The member open in the settings, in the side pane, while there is one. */
export const openMemberId = (model: Model): Option.Option<MemberId.MemberId> =>
  Open.matchOrElse(model.open, { Settings: ({ memberId }) => memberId }, () => Option.none())

/** Whether a member is open in the settings, which shows the side pane. */
export const isMemberOpen = (model: Model): boolean => Option.isSome(openMemberId(model))

/**
 * What Home, the actions, the connections, the agents, the settings, the channels, and the search are made from: the
 * workspace, as the member, in a window of the width `viewport`.
 */
export const ChildInitContext = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  viewport: Viewport
})

export const Message = defineMessageUnion({
  ClickedAllWorkspaces: {},
  ClickedHome: {},
  ClickedConnections: {},
  ClickedAgents: {},
  ClickedSettings: {},
  ClickedWorkspace: {},
  ClickedMembers: {},
  ClickedMenu: {},
  ClickedSearch: {},
  RequestedSearch: {},
  RequestedWorkspaceSettings: {},
  InformedOfViewport: { viewport: Viewport },
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ClosedWorkspace: {},
  ChoseAccountEntry: { entry: ReportedAccountEntry }
})
export type OutMessage = typeof OutMessage.Type

export const WorkspaceDefinition = Block.makeDefinition("Workspace", { Model, Message, OutMessage, ChildInitContext })

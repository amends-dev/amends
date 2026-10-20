/**
 * A workspace the person opened, as their member of it: its groups to pick from, their unfinished
 * actions, their inbox, the tasks they can see, their connections, their agents, their settings, and their
 * channels, and what the main content shows: nothing yet, the inbox, the tasks in triage, every open task, the
 * groups to browse, the connections, one connection, the agents, one agent, the settings, the channels, or a group,
 * with its threads and the thread open among them. A thread opens in the side pane, beside the group's threads or
 * beside the inbox, which stays. The rail picks a destination, and the sidebar lists that destination's items: Home's
 * inbox, tasks, and groups, the agents, the connections by what they give and the channels, or the settings. It
 * lays itself out by the
 * window's width, which its parent informs it of: below 64rem the sidebar and the rail are in a navigation
 * drawer, a dialog that opening an item closes and picking a destination on the rail does not, so the person
 * sees that destination's sidebar, and below 80rem the thread is in a dialog of its own, which
 * follows the thread opening and closing. It lists the host's integrations once, as it opens, informs the
 * connections, the agents, and the channels of them, and lists them again when one asks. Its search, in a
 * dialog over the page, opens from the sidebar and when its parent asks, and what it finds opens a group, a
 * thread in its group, or a conversation with a member. It reports when the person leaves it, and when they
 * ask to sign out.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { GroupId } from "@amends-dev/core/group"
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
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { SearchBlock } from "../../feature/search/block.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { workspaceName } from "../../feature/settings/definition.ts"
import { TasksBlock } from "../../feature/tasks/block.ts"
import { titleOf } from "../../feature/thread/definition.ts"

/**
 * What the main content shows: nothing yet, the inbox, the tasks in triage, every open task, the groups to
 * browse, the connections or one connection among them, the agents or one agent among them, the settings, the
 * channels, or the group open in the workspace.
 */
export const Open = defineTaggedUnion({
  Nothing: {},
  Inbox: {},
  Triage: {},
  Tasks: {},
  Groups: {},
  Connections: {},
  Connection: { connectionId: ConnectionContract.ConnectionId },
  Agents: {},
  Agent: { agentId: Identity.AgentId },
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
  tasks: TasksBlock.Model,
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
  /** The thread's side pane, a dialog, which the shell shows only below 80rem. */
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

/** Whether a thread is open, in the group open or beside the inbox. */
export const isThreadOpen = (model: Model): boolean => Option.isSome(openThreadTitle(model))

/** Whether the side pane is in a dialog at `viewport`, not beside the main pane, which is from `Split` alone. */
export const isAsideFloating = (viewport: Viewport): boolean => viewport !== "Split"

/** What the groups, actions, inbox, tasks, connections, agents, settings, channels, and search are made from: the workspace, as the member. */
export const ChildInitContext = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId })

export const Message = defineMessageUnion({
  ClickedAllWorkspaces: {},
  ClickedSignOut: {},
  ClickedHome: {},
  ClickedInbox: {},
  ClickedTriage: {},
  ClickedTasks: {},
  ClickedConnections: {},
  ClickedAgents: {},
  ClickedSettings: {},
  ClickedWorkspace: {},
  ClickedMembers: {},
  ClickedMenu: {},
  ClickedSearch: {},
  RequestedSearch: {},
  InformedOfViewport: { viewport: Viewport },
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

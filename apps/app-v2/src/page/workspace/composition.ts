import type { Connection as ConnectionContract } from "@amends-dev/connection"
import type { GroupId } from "@amends-dev/core/group"
import type { Identity } from "@amends-dev/core/identity"
import type { MemberId } from "@amends-dev/core/workspace"
import { isAsideInDialog } from "@amends-dev/design/shell"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { Offer } from "../../feature/actions/definition.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { connectionsToast } from "../../feature/connections/wording.ts"
import { SearchBlock } from "../../feature/search/block.ts"
import type { Destination } from "../../feature/search/definition.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { settingsToast } from "../../feature/settings/wording.ts"
import { LoadIntegrations } from "./command.ts"
import { AppAccountEntry, type Model, Open, OutMessage, type SettingsPage, WorkspaceDefinition } from "./definition.ts"
import { HomeBlock } from "./home/block.ts"

/** List the integrations the host installs again, when a Block that showed them failing asks. */
const loadIntegrationsAgain = WorkspaceDefinition.step((model: Model) => ({
  model,
  commands: [LoadIntegrations({ workspaceId: model.workspaceId })]
}))

/** Show Home in the main content. */
export const showHome = WorkspaceDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Home() })
}))

/** Show the connections in the main content. */
export const showConnections = WorkspaceDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Connections() })
}))

/** Show the page of the connection `connectionId` in the main content. */
export const showConnection = (connectionId: ConnectionContract.ConnectionId) =>
  WorkspaceDefinition.step((model: Model) => ({
    model: modifyFields(model, { open: () => Open.Connection({ connectionId }) })
  }))

/** Show the agents in the main content. */
export const showAgents = WorkspaceDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Agents() })
}))

/** Show the page of the agent `agentId` in the main content. */
export const showAgent = (agentId: Identity.AgentId) =>
  WorkspaceDefinition.step((model: Model) => ({
    model: modifyFields(model, { open: () => Open.Agent({ agentId }) })
  }))

/** Show the page `page` of the settings in the main content, with no member open beside it. */
export const showSettings = (page: SettingsPage) =>
  WorkspaceDefinition.step((model: Model) => ({
    model: modifyFields(model, { open: () => Open.Settings({ page, memberId: Option.none() }) })
  }))

/** Open the member `memberId` beside the page of the settings that is showing. */
const openMember = (memberId: MemberId.MemberId) =>
  WorkspaceDefinition.step((model: Model) => ({
    model: modifyFields(model, {
      open: (open) =>
        Open.isAnyOf(["Settings"])(open) ? Open.Settings({ page: open.page, memberId: Option.some(memberId) }) : open
    })
  }))

/** Close the member open beside the page of the settings that is showing. */
const closeMember = WorkspaceDefinition.step((model: Model) => ({
  model: modifyFields(model, {
    open: (open) =>
      Open.isAnyOf(["Settings"])(open) ? Open.Settings({ page: open.page, memberId: Option.none() }) : open
  })
}))

/** Show the channels in the main content. */
export const showChannels = WorkspaceDefinition.step((model: Model) => ({
  model: modifyFields(model, { open: () => Open.Channels() })
}))

/**
 * Switch to a destination, as the rail does: close the side pane's dialog, reset Home, which closes its thread and
 * leaves no group marked in the sidebar, and `show` it, leaving the navigation drawer as it is, so the person sees the
 * sidebar of the destination they picked.
 */
export const switchTo = (show: typeof showHome) => Update.combine([hideAside, HomeBinding.requestReset(), show])

/** Go to a destination, as picking an item of the sidebar does: close the navigation drawer, and switch to it. */
export const goTo = (show: typeof showHome) => Update.combine([MenuBinding.requestClose(), switchTo(show)])

/** Show Home, where the person moved, with the navigation drawer and the side pane's dialog closed. */
const goToHome = () => Update.combine([MenuBinding.requestClose(), hideAside, showHome])

/**
 * Home reports that the person moved within it, which shows it and closes the navigation drawer, that they joined a
 * group, which is confirmed to them, with the offer to open it, and that they created one, which is confirmed to them
 * and shown, as it is already open.
 */
const foldHomeOutMessage = HomeBlock.OutMessage.match({
  Navigated: () => goToHome(),
  JoinedGroup: ({ groupId, place }) =>
    ActionsBinding.confirm({ text: `Joined ${place}`, offer: Offer.OpenGroup({ groupId }) }),
  CreatedGroup: () => Update.combine([ActionsBinding.confirm({ text: "Group created" }), goToHome()])
})

/** Open the group `groupId` in Home, as picking it in the sidebar does, and show Home. */
const openGroupInHome = (groupId: GroupId.GroupId) =>
  Update.combine([HomeBinding.requestOpenGroup({ groupId }), goToHome()])

/** The page of `destination` a search opened: the one the rail goes to, or, for Settings, the account menu's. */
const goToDestination = (destination: Destination) =>
  Match.value(destination).pipe(
    Match.when("Inbox", () => goTo(showHome)),
    Match.when("Agents", () => goTo(showAgents)),
    Match.when("Connections", () => goTo(showConnections)),
    Match.when("Settings", () => goTo(showSettings("Workspace"))),
    Match.exhaustive
  )

/**
 * What the search opened is shown as the rail, the sidebar, and the tasks show it: a page as the rail goes to it, with
 * the navigation drawer shut, Inbox being Home, which opens on it, and Settings the Workspace page the account menu
 * goes to; a group or a thread in Home, as picking it in the sidebar does; an agent on its page. A person is opened as
 * a conversation, which Home's groups find or start.
 */
const foldSearchOutMessage = SearchBlock.OutMessage.match({
  OpenedDestination: ({ destination }) => goToDestination(destination),
  OpenedGroup: ({ groupId }) => openGroupInHome(groupId),
  OpenedThread: ({ groupId, threadId }) =>
    Update.combine([HomeBinding.requestOpenThread({ groupId, threadId }), goToHome()]),
  OpenedPerson: ({ memberId }) => HomeBinding.requestConversationWith({ memberId }),
  OpenedAgent: ({ agentId }) => goTo(showAgent(agentId))
})

/**
 * Asking to browse the agents shows the list as any destination is gone to, and picking one opens its page. Picking
 * a turn an agent has under way opens its thread in Home, in its group, as picking a thread the search found does.
 * Asking again for the integrations lists them again. What the person did to an agent is confirmed to them in a toast:
 * saving its name or its setup, adding one, which opens its page, and removing one, which shows the list.
 */
const foldAgentsOutMessage = AgentsBlock.OutMessage.match({
  RequestedIntegrations: () => loadIntegrationsAgain,
  RequestedBrowse: () => goTo(showAgents),
  OpenedAgent: ({ agentId }) => goTo(showAgent(agentId)),
  OpenedThread: ({ groupId, threadId }) =>
    Update.combine([HomeBinding.requestOpenThread({ groupId, threadId }), goToHome()]),
  SavedName: () => ActionsBinding.confirm({ text: "Name saved" }),
  SavedSetup: () => ActionsBinding.confirm({ text: "Setup saved" }),
  CreatedAgent: ({ agentId, name }) =>
    Update.combine([ActionsBinding.confirm({ text: `${name} created` }), goTo(showAgent(agentId))]),
  RemovedAgent: ({ name }) => Update.combine([ActionsBinding.confirm({ text: `${name} removed` }), goTo(showAgents)])
})

/**
 * Asking to browse the connections shows the list as any destination is gone to, picking one opens its page, and
 * asking to browse the channels shows them. Asking again for the integrations lists them again. What the person did to
 * a connection is confirmed to them in a toast: saving its name or its settings, replacing its key, adding one, which
 * opens its page, and removing one, which shows the list.
 */
const foldConnectionsOutMessage = ConnectionsBlock.OutMessage.match({
  RequestedIntegrations: () => loadIntegrationsAgain,
  RequestedBrowse: () => goTo(showConnections),
  OpenedConnection: ({ connectionId }) => goTo(showConnection(connectionId)),
  RequestedChannels: () => goTo(showChannels),
  SavedName: () => ActionsBinding.confirm({ text: connectionsToast.nameSaved }),
  SavedSettings: () => ActionsBinding.confirm({ text: connectionsToast.settingsSaved }),
  ReplacedKey: () => ActionsBinding.confirm({ text: connectionsToast.keyReplaced }),
  CreatedConnection: ({ connectionId, name }) =>
    Update.combine([
      ActionsBinding.confirm({ text: connectionsToast.created(name) }),
      goTo(showConnection(connectionId))
    ]),
  RemovedConnection: ({ name }) =>
    Update.combine([ActionsBinding.confirm({ text: connectionsToast.removed(name) }), goTo(showConnections)])
})

/**
 * A member opening in the settings opens beside the page, and opens the side pane's dialog where the pane is one;
 * closing it closes both. Choosing the workspace's settings in the account menu shows the Workspace page, as the rail's
 * Settings does. What the person did is confirmed to them in a toast: renaming the workspace or themselves,
 * changing a member's role, handing the workspace over, inviting someone, and revoking an invitation. Removing a
 * member confirms it too, and closes the member, who is no longer there to show.
 */
const foldSettingsOutMessage = SettingsBlock.OutMessage.match({
  OpenedMember: ({ memberId }) => Update.combine([openMember(memberId), showAside]),
  ClosedMember: () => Update.combine([closeMember, hideAside]),
  RenamedWorkspace: () => ActionsBinding.confirm({ text: settingsToast.workspaceRenamed }),
  RenamedSelf: () => ActionsBinding.confirm({ text: settingsToast.ownNameSaved }),
  ChangedRole: ({ name }) => ActionsBinding.confirm({ text: settingsToast.roleSaved(name) }),
  RemovedMember: ({ name }) =>
    Update.combine([closeMember, hideAside, ActionsBinding.confirm({ text: settingsToast.memberRemoved(name) })]),
  TransferredOwnership: ({ name }) => ActionsBinding.confirm({ text: settingsToast.ownerChanged(name) }),
  InvitedMember: () => ActionsBinding.confirm({ text: settingsToast.invitationCreated }),
  RevokedInvitation: () => ActionsBinding.confirm({ text: settingsToast.invitationRevoked }),
  ChoseAccountEntry: ({ entry }) =>
    entry === "WorkspaceSettings" ? switchTo(showSettings("Workspace")) : WorkspaceDefinition.stepNoop()
})

/** The navigation drawer's dialog opening, closing, and finishing its close changes nothing else. */
const foldMenuOutMessage = DialogBlock.OutMessage.match({
  Opened: () => WorkspaceDefinition.stepNoop(),
  Closed: () => WorkspaceDefinition.stepNoop(),
  CompletedClose: () => WorkspaceDefinition.stepNoop()
})

/**
 * The side pane's dialog opening and finishing its close change nothing else. Its closing, by Escape, its scrim, or the
 * page, closes the member it shows, except at `Split`: there it is the pane moving beside the main pane, not the
 * person leaving the member.
 */
const foldAsideOutMessage = DialogBlock.OutMessage.match({
  Opened: () => WorkspaceDefinition.stepNoop(),
  Closed: () =>
    WorkspaceDefinition.step((model: Model) =>
      isAsideInDialog(model.viewport) ? closeMember : WorkspaceDefinition.stepNoop()
    ),
  CompletedClose: () => WorkspaceDefinition.stepNoop()
})

export const MenuBinding = WorkspaceDefinition.bindChild(DialogBlock, {
  field: "menu",
  init: { contextToArgs: () => [{ id: "workspace-menu" }] },
  outMessage: { fold: foldMenuOutMessage }
})

export const AsideBinding = WorkspaceDefinition.bindChild(DialogBlock, {
  field: "aside",
  init: { contextToArgs: () => [{ id: "workspace-aside" }] },
  outMessage: { fold: foldAsideOutMessage }
})

/** Open the side pane's dialog, where the window's width puts the side pane in one. */
export const showAside = WorkspaceDefinition.step((model: Model) =>
  isAsideInDialog(model.viewport) ? AsideBinding.requestOpen() : WorkspaceDefinition.stepNoop()
)

/** Close the side pane's dialog; closing one that is closed does nothing. */
export const hideAside = AsideBinding.requestClose()

/** Taking what a confirmation offers does it: Open, on a group, opens it in Home, as the search does. */
const foldActionsOutMessage = ActionsBlock.OutMessage.match({
  TookOffer: ({ offer }) => Offer.match(offer, { OpenGroup: ({ groupId }) => openGroupInHome(groupId) })
})

export const ActionsBinding = WorkspaceDefinition.bindChild(ActionsBlock, {
  field: "actions",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldActionsOutMessage }
})

export const SearchBinding = WorkspaceDefinition.bindChild(SearchBlock, {
  field: "search",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldSearchOutMessage }
})

export const HomeBinding = WorkspaceDefinition.bindChild(HomeBlock, {
  field: "home",
  init: { contextToArgs: ({ workspaceId, memberId, viewport }) => [workspaceId, memberId, viewport] },
  outMessage: { fold: foldHomeOutMessage }
})

export const ConnectionsBinding = WorkspaceDefinition.bindChild(ConnectionsBlock, {
  field: "connections",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldConnectionsOutMessage }
})

export const AgentsBinding = WorkspaceDefinition.bindChild(AgentsBlock, {
  field: "agents",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldAgentsOutMessage }
})

export const SettingsBinding = WorkspaceDefinition.bindChild(SettingsBlock, {
  field: "settings",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: {
    /** The entries of the account menu that the app acts on are reported to it. */
    forward: SettingsBlock.OutMessage.match({
      OpenedMember: () => undefined,
      ClosedMember: () => undefined,
      RenamedWorkspace: () => undefined,
      RenamedSelf: () => undefined,
      ChangedRole: () => undefined,
      RemovedMember: () => undefined,
      TransferredOwnership: () => undefined,
      InvitedMember: () => undefined,
      RevokedInvitation: () => undefined,
      ChoseAccountEntry: ({ entry }) =>
        Schema.is(AppAccountEntry)(entry) ? OutMessage.ChoseAccountEntry({ entry }) : undefined
    }),
    fold: foldSettingsOutMessage
  }
})

export const ChannelsBinding = WorkspaceDefinition.bindChild(ChannelsBlock, {
  field: "channels",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: ChannelsBlock.OutMessage.match({ RequestedIntegrations: () => loadIntegrationsAgain }) }
})

export const WorkspaceComposition = WorkspaceDefinition.makeComposition({
  bindings: [
    MenuBinding,
    AsideBinding,
    ActionsBinding,
    SearchBinding,
    HomeBinding,
    ConnectionsBinding,
    AgentsBinding,
    SettingsBinding,
    ChannelsBinding
  ]
})
export type WorkspaceViewBuilder = Block.ViewBuilderFor<typeof WorkspaceComposition>

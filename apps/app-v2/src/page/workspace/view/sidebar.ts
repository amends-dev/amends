/** The workspace header and the navigation of its open destination. */

import { sidebar, sidebarHeader, sidebarItem, sidebarSection } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { sidebarView as agentsSidebarView } from "../../../feature/agents/view/sidebar.ts"
import { sidebarView as connectionsSidebarView } from "../../../feature/connections/view/sidebar.ts"
import { Destination, type DestinationHref } from "../../../route.ts"
import { AgentsBinding, ConnectionsBinding, HomeBinding, type WorkspaceViewBuilder } from "../composition.ts"
import { Message, type Model, nameOf, Open, type SettingsPage } from "../definition.ts"
import { sidebarView as homeSidebarView } from "../home/view/sidebar.ts"

/**
 * The agents' section of the sidebar, whose title is current while the list of agents is what the main pane shows, and
 * whose row is current while that agent's page is.
 */
const agentsSections = (
  model: Model,
  h: WorkspaceViewBuilder,
  destinationHref?: DestinationHref
): ReadonlyArray<Html> => [
  h.block(
    AgentsBinding.embedView({
      slotId: "agents-sidebar",
      model: model.agents,
      view: agentsSidebarView,
      viewInputs: {
        itemHref: (agentId) => destinationHref?.(Destination.Agent({ agentId })),
        browseHref: destinationHref?.(Destination.Agents({ tab: model.agents.browse.tab })),
        isListOpen: Open.isAnyOf(["Agents"])(model.open),
        openAgentId: Open.matchOrElse(model.open, { Agent: ({ agentId }) => Option.some(agentId) }, () => Option.none())
      }
    })
  )
]

/**
 * The connections' sections of the sidebar, whose title is current while the list shows on its tab, and whose row is
 * current while that connection's page is, and the channels', whose title is current while the channels show.
 */
const connectionsSections = (
  model: Model,
  h: WorkspaceViewBuilder,
  destinationHref?: DestinationHref
): ReadonlyArray<Html> => [
  h.block(
    ConnectionsBinding.embedView({
      slotId: "connections-sidebar",
      model: model.connections,
      view: connectionsSidebarView,
      viewInputs: {
        itemHref: (connectionId) => destinationHref?.(Destination.Connection({ connectionId })),
        tabHref: (tab) => destinationHref?.(Destination.Connections({ tab })),
        channelsHref: destinationHref?.(Destination.Channels()),
        isListOpen: Open.isAnyOf(["Connections"])(model.open),
        openConnectionId: Open.matchOrElse(
          model.open,
          { Connection: ({ connectionId }) => Option.some(connectionId) },
          () => Option.none()
        ),
        isChannelsOpen: Open.isAnyOf(["Channels"])(model.open)
      }
    })
  )
]

/** The settings' section of the sidebar: the workspace's page and the members', each current while it shows. */
const settingsSections = (
  model: Model,
  h: WorkspaceViewBuilder,
  destinationHref?: DestinationHref
): ReadonlyArray<Html> => {
  const isOnPage = (page: SettingsPage) =>
    Open.matchOrElse(model.open, { Settings: (open) => open.page === page }, () => false)

  return [
    sidebarSection(h, {
      label: "Settings",
      children: [
        sidebarItem(h, {
          icon: "mark-settings",
          label: "Workspace",
          isCurrent: isOnPage("Workspace"),
          href: destinationHref?.(Destination.Settings({ page: "Workspace", memberId: Option.none() })),
          onClick: Message.ClickedWorkspace()
        }),
        sidebarItem(h, {
          icon: "users",
          label: "Members",
          isCurrent: isOnPage("Members"),
          href: destinationHref?.(Destination.Settings({ page: "Members", memberId: Option.none() })),
          onClick: Message.ClickedMembers()
        })
      ]
    })
  ]
}

/** The sections of the sidebar that belong to the destination open. */
const destinationSections = (
  model: Model,
  h: WorkspaceViewBuilder,
  destinationHref?: DestinationHref
): ReadonlyArray<Html> =>
  Open.match(model.open, {
    Home: () => [
      h.block(
        HomeBinding.embedView({
          slotId: "home-sidebar",
          model: model.home,
          view: homeSidebarView,
          viewInputs: { destinationHref: (destination) => destinationHref?.(Destination.Home({ destination })) }
        })
      )
    ],
    Agents: () => agentsSections(model, h, destinationHref),
    Agent: () => agentsSections(model, h, destinationHref),
    Connections: () => connectionsSections(model, h, destinationHref),
    Connection: () => connectionsSections(model, h, destinationHref),
    Channels: () => connectionsSections(model, h, destinationHref),
    Settings: () => settingsSections(model, h, destinationHref)
  })

/**
 * The sidebar: the workspace's name, as the button to the workspaces, and the search, and the sections of the
 * destination open.
 */
export const sidebarView = (
  model: Model,
  isApplePlatform: boolean,
  h: WorkspaceViewBuilder,
  destinationHref?: DestinationHref
): Html => {
  const name = nameOf(model)
  return sidebar(h, {
    label: name,
    header: sidebarHeader(h, {
      mark: name.slice(0, 1),
      name,
      onClick: Message.ClickedWorkspaceSwitcher(),
      search: {
        label: "Find anything…",
        shortcut: isApplePlatform ? "⌘K" : "Ctrl K",
        onClick: Message.ClickedSearch()
      }
    }),
    children: destinationSections(model, h, destinationHref)
  })
}

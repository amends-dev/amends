import { rail } from "@amends-dev/design/rail"
import { shell } from "@amends-dev/design/shell"
import { sidebar, sidebarHeader, sidebarItem, sidebarSection } from "@amends-dev/design/sidebar"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { Appearance } from "../../appearance.ts"
import {
  agentView,
  dialogView as agentsDialogView,
  sidebarView as agentsSidebarView,
  view as agentsView
} from "../../feature/agents/view.ts"
import {
  connectionView,
  dialogView as connectionsDialogView,
  sidebarView as connectionsSidebarView,
  view as connectionsView
} from "../../feature/connections/view.ts"
import {
  accountView as settingsAccountView,
  dialogView as settingsDialogView,
  memberView as settingsMemberView,
  membersView as settingsMembersView
} from "../../feature/settings/view.ts"
import {
  ActionsBinding,
  AgentsBinding,
  AsideBinding,
  ChannelsBinding,
  ConnectionsBinding,
  HomeBinding,
  MenuBinding,
  SearchBinding,
  SettingsBinding,
  WorkspaceComposition,
  type WorkspaceViewBuilder
} from "./composition.ts"
import { Message, type Model, nameOf, Open, openMemberId, type SettingsPage } from "./definition.ts"
import { isThreadOpen } from "./home/definition.ts"
import {
  asideDialogView as homeAsideDialogView,
  dialogView as homeDialogView,
  sidebarView as homeSidebarView,
  threadView as homeThreadView,
  view as homeView
} from "./home/view.ts"

/**
 * Who is signed in, which the account menu names under the person's name, their Appearance, which the menu checks, the
 * time now, which the destinations that show ages and days follow, and whether the page runs on an Apple platform,
 * which decides how the search's shortcut is written.
 */
export type ViewInputs = Readonly<{
  email: string
  appearance: Appearance
  now: DateTime.Utc
  isApplePlatform: boolean
}>

/** The destinations of the rail, as the open workspace shows them. */
const railItems = (model: Model) => [
  {
    icon: "mark-home" as const,
    label: "Home",
    isCurrent: Open.isAnyOf(["Home"])(model.open),
    onClick: Message.ClickedHome()
  },
  {
    icon: "mark-agents" as const,
    label: "Agents",
    isCurrent: Open.isAnyOf(["Agents", "Agent"])(model.open),
    onClick: Message.ClickedAgents()
  },
  {
    icon: "mark-connections" as const,
    label: "Connections",
    isCurrent: Open.isAnyOf(["Connections", "Connection", "Channels"])(model.open),
    onClick: Message.ClickedConnections()
  }
]

/**
 * The agents' section of the sidebar, whose title is current while the list of agents is what the main pane shows, and
 * whose row is current while that agent's page is.
 */
const agentsSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> => [
  h.block(
    AgentsBinding.embedView({
      slotId: "agents-sidebar",
      model: model.agents,
      view: agentsSidebarView,
      viewInputs: {
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
const connectionsSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> => [
  h.block(
    ConnectionsBinding.embedView({
      slotId: "connections-sidebar",
      model: model.connections,
      view: connectionsSidebarView,
      viewInputs: {
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
const settingsSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> => {
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
          onClick: Message.ClickedWorkspace()
        }),
        sidebarItem(h, {
          icon: "users",
          label: "Members",
          isCurrent: isOnPage("Members"),
          onClick: Message.ClickedMembers()
        })
      ]
    })
  ]
}

/** The sections of the sidebar that belong to the destination open. */
const destinationSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> =>
  Open.match(model.open, {
    Home: () => [h.block(HomeBinding.embedView({ slotId: "home-sidebar", model: model.home, view: homeSidebarView }))],
    Agents: () => agentsSections(model, h),
    Agent: () => agentsSections(model, h),
    Connections: () => connectionsSections(model, h),
    Connection: () => connectionsSections(model, h),
    Channels: () => connectionsSections(model, h),
    Settings: () => settingsSections(model, h)
  })

/**
 * The sidebar: the workspace's name, as the button to the workspaces, and the search, and the sections of the
 * destination open.
 */
const sidebarView = (model: Model, { isApplePlatform }: ViewInputs, h: WorkspaceViewBuilder): Html => {
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
    children: destinationSections(model, h)
  })
}

/**
 * The main pane: the destination the person opened. Home and the settings' members page are given the time now, and
 * Home the workspace's name.
 */
const mainView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Html =>
  Open.match(model.open, {
    Home: () =>
      h.block(
        HomeBinding.embedView({
          slotId: "home",
          model: model.home,
          view: homeView,
          viewInputs: { now, workspaceName: nameOf(model) }
        })
      ),
    Connections: () =>
      h.block(
        ConnectionsBinding.embedView({
          slotId: "connections",
          model: model.connections,
          view: connectionsView,
          viewInputs: { workspaceName: nameOf(model), viewport: model.viewport }
        })
      ),
    Connection: ({ connectionId }) =>
      h.block(
        ConnectionsBinding.embedView({
          slotId: "connection",
          model: model.connections,
          view: connectionView,
          viewInputs: { connectionId, workspaceName: nameOf(model) }
        })
      ),
    Agents: () =>
      h.block(
        AgentsBinding.embedView({
          slotId: "agents",
          model: model.agents,
          view: agentsView,
          viewInputs: { workspaceName: nameOf(model), viewport: model.viewport }
        })
      ),
    Agent: ({ agentId }) =>
      h.block(
        AgentsBinding.embedView({
          slotId: "agent",
          model: model.agents,
          view: agentView,
          viewInputs: { agentId, workspaceName: nameOf(model) }
        })
      ),
    Settings: ({ page }) =>
      page === "Workspace"
        ? h.block(SettingsBinding.embedView({ slotId: "settings-workspace", model: model.settings }))
        : h.block(
            SettingsBinding.embedView({
              slotId: "settings-members",
              model: model.settings,
              view: settingsMembersView,
              viewInputs: { now, viewport: model.viewport, openMemberId: openMemberId(model) }
            })
          ),
    Channels: () => h.block(ChannelsBinding.embedView({ slotId: "channels", model: model.channels }))
  })

/** How a dialog is drawn, given what it publishes. */
type ToView = (render: RenderInfo) => Html

/**
 * What the side pane is called, which names the dialog that holds it, what it shows, whether its dialog is open, and
 * the dialog, which the shell draws.
 */
type Aside = Readonly<{ label: string; view: Html; isOpen: boolean; dialog: (toView: ToView) => Html }>

/**
 * The side pane: Home's thread, while Home shows one, or the member open in the settings, while there is one, given
 * the time now.
 */
const asideView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Option.Option<Aside> =>
  Open.matchOrElse(
    model.open,
    {
      Home: () =>
        isThreadOpen(model.home)
          ? Option.some({
              label: "Thread",
              view: h.block(
                HomeBinding.embedView({
                  slotId: "home-thread",
                  model: model.home,
                  view: homeThreadView,
                  viewInputs: { now }
                })
              ),
              isOpen: model.home.aside.isOpen,
              dialog: (toView: ToView) =>
                h.block(
                  HomeBinding.embedView({
                    slotId: "home-aside",
                    model: model.home,
                    view: homeAsideDialogView,
                    viewInputs: { toView }
                  })
                )
            })
          : Option.none(),
      Settings: ({ memberId }) =>
        Option.isSome(memberId)
          ? Option.some({
              label: "Member details",
              view: h.block(
                SettingsBinding.embedView({
                  slotId: "settings-member",
                  model: model.settings,
                  view: settingsMemberView
                })
              ),
              isOpen: model.aside.isOpen,
              dialog: (toView: ToView) =>
                h.block(AsideBinding.embedView({ slotId: "aside", model: model.aside, viewInputs: { toView } }))
            })
          : Option.none()
    },
    () => Option.none()
  )

/**
 * The open workspace on the shell: the rail of destinations and the person's account, the sidebar, the main pane, the
 * side pane, and the notices, laid out for the window's width, with the dialogs of the navigation drawer and of the
 * side pane lent to the shell, and the dialogs of Home's groups, for starting a team or a conversation, of the
 * connections, for adding one, replacing its key, or confirming its removal, of the agents, for adding one or
 * confirming its removal, of the settings, for inviting someone, reading the invitations, revoking one, handing the
 * workspace over, or removing a member, and of the search, which the shell keeps in the frame whether or not the
 * sidebar or the page that opens them is on the page.
 */
export const view = WorkspaceComposition.makeView.withInputs<ViewInputs>((model, inputs, h) => {
  const { now } = inputs
  const aside = asideView(model, now, h)

  return shell(h, {
    viewport: model.viewport,
    rail: rail(h, {
      brand: { label: "Amends home", onClick: Message.ClickedHome() },
      items: railItems(model),
      search: { label: "Search", onClick: Message.ClickedSearch() },
      footer: [
        {
          icon: "mark-settings",
          label: "Settings",
          isCurrent: Open.isAnyOf(["Settings"])(model.open),
          onClick: Message.ClickedSettings()
        }
      ],
      account: h.block(
        SettingsBinding.embedView({
          slotId: "account",
          model: model.settings,
          view: settingsAccountView,
          viewInputs: { email: inputs.email, appearance: inputs.appearance }
        })
      )
    }),
    sidebar: sidebarView(model, inputs, h),
    main: mainView(model, now, h),
    ...(Option.isSome(aside) ? { aside: aside.value } : {}),
    notices: h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions })),
    menu: {
      id: model.menu.id,
      onOpen: Message.ClickedMenu(),
      isOpen: model.menu.isOpen,
      dialog: (toView) => h.block(MenuBinding.embedView({ slotId: "menu", model: model.menu, viewInputs: { toView } }))
    },
    dialogs: [
      h.block(HomeBinding.embedView({ slotId: "home-dialog", model: model.home, view: homeDialogView })),
      h.block(
        ConnectionsBinding.embedView({
          slotId: "connections-dialog",
          model: model.connections,
          view: connectionsDialogView,
          viewInputs: { workspaceName: nameOf(model) }
        })
      ),
      h.block(
        AgentsBinding.embedView({
          slotId: "agents-dialog",
          model: model.agents,
          view: agentsDialogView,
          viewInputs: { workspaceName: nameOf(model) }
        })
      ),
      h.block(
        SettingsBinding.embedView({
          slotId: "settings-dialog",
          model: model.settings,
          view: settingsDialogView,
          viewInputs: { now }
        })
      ),
      h.block(SearchBinding.embedView({ slotId: "search", model: model.search }))
    ]
  })
})

import { iconButton } from "@amends-dev/design/control"
import { pane } from "@amends-dev/design/pane"
import { rail } from "@amends-dev/design/rail"
import { shell } from "@amends-dev/design/shell"
import { sidebar, sidebarHeader, sidebarItem, sidebarSection } from "@amends-dev/design/sidebar"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { Appearance } from "../../appearance.ts"
import {
  agentView,
  dialogView as agentsDialogView,
  sidebarView as agentsSidebarView
} from "../../feature/agents/view.ts"
import {
  connectionView,
  dialogView as connectionsDialogView,
  sidebarView as connectionsSidebarView,
  view as connectionsView
} from "../../feature/connections/view.ts"
import { threadView as groupThreadView } from "../../feature/group/view.ts"
import { browseView, dialogView } from "../../feature/groups/view.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
import { threadView as inboxThreadView } from "../../feature/inbox/view.ts"
import {
  accountView as settingsAccountView,
  dialogView as settingsDialogView,
  memberView as settingsMemberView,
  membersView as settingsMembersView
} from "../../feature/settings/view.ts"
import { triageCount } from "../../feature/tasks/definition.ts"
import { tasksView, triageView } from "../../feature/tasks/view.ts"
import {
  ActionsBinding,
  AgentsBinding,
  AsideBinding,
  ChannelsBinding,
  ConnectionsBinding,
  GroupBinding,
  GroupsBinding,
  InboxBinding,
  MenuBinding,
  SearchBinding,
  SettingsBinding,
  TasksBinding,
  WorkspaceComposition,
  type WorkspaceViewBuilder
} from "./composition.ts"
import { Message, type Model, nameOf, Open, openMemberId, openThreadTitle, type SettingsPage } from "./definition.ts"

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
    isCurrent: Open.isAnyOf(["Nothing", "Inbox", "Triage", "Tasks", "Groups", "Group"])(model.open),
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

/** Home's sections of the sidebar: the inbox, the triage, the tasks, and the groups. */
const homeSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> => {
  const waiting = waitingCount(model.inbox)
  const inTriage = triageCount(model.tasks.items)
  return [
    sidebarSection(h, {
      children: [
        sidebarItem(h, {
          icon: "mark-mail",
          label: "Inbox",
          ...(waiting > 0 ? { count: waiting } : {}),
          isCurrent: Open.isAnyOf(["Inbox"])(model.open),
          onClick: Message.ClickedInbox()
        }),
        sidebarItem(h, {
          icon: "mark-triage",
          label: "Triage",
          ...(inTriage > 0 ? { count: inTriage } : {}),
          isCurrent: Open.isAnyOf(["Triage"])(model.open),
          onClick: Message.ClickedTriage()
        }),
        sidebarItem(h, {
          icon: "mark-tasks",
          label: "Tasks",
          isCurrent: Open.isAnyOf(["Tasks"])(model.open),
          onClick: Message.ClickedTasks()
        })
      ]
    }),
    h.block(
      GroupsBinding.embedView({
        slotId: "groups",
        model: model.groups,
        viewInputs: { openThread: openThreadTitle(model), isBrowsing: Open.isAnyOf(["Groups"])(model.open) }
      })
    )
  ]
}

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

/** The sections of the sidebar that belong to the destination open, Home's for every one that is Home's. */
const destinationSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> =>
  Open.matchOrElse(
    model.open,
    {
      Agents: () => agentsSections(model, h),
      Agent: () => agentsSections(model, h),
      Connections: () => connectionsSections(model, h),
      Connection: () => connectionsSections(model, h),
      Channels: () => connectionsSections(model, h),
      Settings: () => settingsSections(model, h)
    },
    () => homeSections(model, h)
  )

/**
 * The sidebar: the workspace's name and the search, and the sections of the destination open.
 */
const sidebarView = (model: Model, { isApplePlatform }: ViewInputs, h: WorkspaceViewBuilder): Html => {
  const name = nameOf(model)
  return sidebar(h, {
    label: name,
    header: sidebarHeader(h, {
      mark: name.slice(0, 1),
      name,
      actions: [
        iconButton(
          h,
          { icon: "chevron-down", label: "All workspaces", onClick: Message.ClickedAllWorkspaces() },
          { size: "compact" }
        )
      ],
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
 * The main pane: the destination the person opened, or, while they have opened none, the way to pick one. The
 * inbox, the tasks, and the open group are given the time now.
 */
const mainView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Html =>
  Open.match(model.open, {
    Nothing: () => {
      const name = nameOf(model)
      return pane(h, {
        variant: "main",
        label: name,
        header: { title: name, mark: { text: name.slice(0, 1) }, subtitle: "Pick a group, or open your inbox." },
        body: []
      })
    },
    Inbox: () => h.block(InboxBinding.embedView({ slotId: "inbox", model: model.inbox, viewInputs: { now } })),
    Triage: () =>
      h.block(TasksBinding.embedView({ slotId: "triage", model: model.tasks, view: triageView, viewInputs: { now } })),
    Tasks: () =>
      h.block(TasksBinding.embedView({ slotId: "tasks", model: model.tasks, view: tasksView, viewInputs: { now } })),
    Groups: () => h.block(GroupsBinding.embedView({ slotId: "browse", model: model.groups, view: browseView })),
    Connections: () =>
      h.block(
        ConnectionsBinding.embedView({
          slotId: "connections",
          model: model.connections,
          view: connectionsView,
          viewInputs: { workspaceName: nameOf(model) }
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
    Agents: () => h.block(AgentsBinding.embedView({ slotId: "agents", model: model.agents })),
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
    Channels: () => h.block(ChannelsBinding.embedView({ slotId: "channels", model: model.channels })),
    Group: ({ groupId, model: open }) =>
      h.block(GroupBinding.embedView({ key: groupId, slotId: "group", model: open, viewInputs: { now } }))
  })

/** What the side pane is called, which names the dialog that holds it, and what it shows. */
type Aside = Readonly<{ label: string; view: Html }>

/**
 * The side pane: the thread open, in the group open or beside the inbox, or the member open in the settings, while
 * there is one, given the time now.
 */
const asideView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Option.Option<Aside> =>
  Open.matchOrElse(
    model.open,
    {
      Inbox: () =>
        Option.isSome(model.inbox.selected)
          ? Option.some({
              label: "Thread",
              view: h.block(
                InboxBinding.embedView({
                  slotId: "inbox-thread",
                  model: model.inbox,
                  viewInputs: { now },
                  view: inboxThreadView
                })
              )
            })
          : Option.none(),
      Group: ({ groupId, model: open }) =>
        Option.isSome(open.thread)
          ? Option.some({
              label: "Thread",
              view: h.block(
                GroupBinding.embedView({
                  key: groupId,
                  slotId: "group-thread",
                  model: open,
                  view: groupThreadView,
                  viewInputs: { now }
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
              )
            })
          : Option.none()
    },
    () => Option.none()
  )

/**
 * The open workspace on the shell: the rail of destinations and the person's account, the sidebar, the main pane, the
 * thread's side pane, and the notices, laid out for the window's width, with the dialogs of the navigation drawer and
 * of the side pane lent to the shell, and the dialogs of the groups, for starting a team or a conversation, of the
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
    ...(Option.isSome(aside)
      ? {
          aside: {
            label: aside.value.label,
            view: aside.value.view,
            isOpen: model.aside.isOpen,
            dialog: (toView) =>
              h.block(AsideBinding.embedView({ slotId: "aside", model: model.aside, viewInputs: { toView } }))
          }
        }
      : {}),
    notices: h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions })),
    menu: {
      onOpen: Message.ClickedMenu(),
      isOpen: model.menu.isOpen,
      dialog: (toView) => h.block(MenuBinding.embedView({ slotId: "menu", model: model.menu, viewInputs: { toView } }))
    },
    dialogs: [
      h.block(GroupsBinding.embedView({ slotId: "groups-dialog", model: model.groups, view: dialogView })),
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

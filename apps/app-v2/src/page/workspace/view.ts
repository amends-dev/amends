import { button, hint, iconButton } from "@amends-dev/design/control"
import { pane } from "@amends-dev/design/pane"
import { rail } from "@amends-dev/design/rail"
import { shell } from "@amends-dev/design/shell"
import { sidebar, sidebarFooter, sidebarHeader, sidebarItem, sidebarSection } from "@amends-dev/design/sidebar"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { agentView, sidebarView as agentsSidebarView } from "../../feature/agents/view.ts"
import { sidebarView as connectionsSidebarView } from "../../feature/connections/view.ts"
import { threadView as groupThreadView } from "../../feature/group/view.ts"
import { browseView, dialogView } from "../../feature/groups/view.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
import { threadView as inboxThreadView } from "../../feature/inbox/view.ts"
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
import { Message, type Model, nameOf, Open, openThreadTitle } from "./definition.ts"

/**
 * Who is signed in, which the sidebar's footer shows beside the way to sign out, the time now, which the
 * destinations that show ages and days follow, and whether the page runs on an Apple platform, which decides
 * how the search's shortcut is written.
 */
export type ViewInputs = Readonly<{ email: string; now: DateTime.Utc; isApplePlatform: boolean }>

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
    isCurrent: Open.isAnyOf(["Connections", "Channels"])(model.open),
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

/** The connections' sections of the sidebar, and the channels', whose title is current while the channels show. */
const connectionsSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> => [
  h.block(
    ConnectionsBinding.embedView({
      slotId: "connections-sidebar",
      model: model.connections,
      view: connectionsSidebarView,
      viewInputs: { isChannelsOpen: Open.isAnyOf(["Channels"])(model.open) }
    })
  )
]

/** The settings' section of the sidebar: the workspace's and its members', which both open the settings. */
const settingsSections = (h: WorkspaceViewBuilder): ReadonlyArray<Html> => [
  sidebarSection(h, {
    label: "Settings",
    children: [
      sidebarItem(h, {
        icon: "mark-settings",
        label: "Workspace",
        isCurrent: false,
        onClick: Message.ClickedWorkspace()
      }),
      sidebarItem(h, { icon: "users", label: "Members", isCurrent: false, onClick: Message.ClickedMembers() })
    ]
  })
]

/** The sections of the sidebar that belong to the destination open, Home's for every one that is Home's. */
const destinationSections = (model: Model, h: WorkspaceViewBuilder): ReadonlyArray<Html> =>
  Open.matchOrElse(
    model.open,
    {
      Agents: () => agentsSections(model, h),
      Agent: () => agentsSections(model, h),
      Connections: () => connectionsSections(model, h),
      Channels: () => connectionsSections(model, h),
      Settings: () => settingsSections(h)
    },
    () => homeSections(model, h)
  )

/**
 * The sidebar: the workspace's name and the search, the sections of the destination open, and who is signed in.
 */
const sidebarView = (model: Model, { email, isApplePlatform }: ViewInputs, h: WorkspaceViewBuilder): Html => {
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
    children: destinationSections(model, h),
    footer: sidebarFooter(h, [hint(h, email), button(h, "Sign out", Message.ClickedSignOut(), { variant: "link" })])
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
    Connections: () => h.block(ConnectionsBinding.embedView({ slotId: "connections", model: model.connections })),
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
    Settings: () => h.block(SettingsBinding.embedView({ slotId: "settings", model: model.settings })),
    Channels: () => h.block(ChannelsBinding.embedView({ slotId: "channels", model: model.channels })),
    Group: ({ groupId, model: open }) =>
      h.block(GroupBinding.embedView({ key: groupId, slotId: "group", model: open, viewInputs: { now } }))
  })

/** The side pane: the thread open, in the group open or beside the inbox, while there is one, given the time now. */
const asideView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Option.Option<Html> =>
  Open.matchOrElse(
    model.open,
    {
      Inbox: () =>
        Option.isSome(model.inbox.selected)
          ? Option.some(
              h.block(
                InboxBinding.embedView({
                  slotId: "inbox-thread",
                  model: model.inbox,
                  viewInputs: { now },
                  view: inboxThreadView
                })
              )
            )
          : Option.none(),
      Group: ({ groupId, model: open }) =>
        Option.isSome(open.thread)
          ? Option.some(
              h.block(
                GroupBinding.embedView({
                  key: groupId,
                  slotId: "group-thread",
                  model: open,
                  view: groupThreadView,
                  viewInputs: { now }
                })
              )
            )
          : Option.none()
    },
    () => Option.none()
  )

/**
 * The open workspace on the shell: the rail of destinations, the sidebar, the main pane, the thread's side pane,
 * and the notices, laid out for the window's width, with the dialogs of the navigation drawer and of the side
 * pane lent to the shell, and the dialogs of the groups, for starting a team or a conversation, and of the search,
 * which the shell keeps in the frame whether or not the sidebar or the page that opens them is on the page.
 */
export const view = WorkspaceComposition.makeView.withInputs<ViewInputs>((model, inputs, h) => {
  const { now } = inputs
  const aside = asideView(model, now, h)

  return shell(h, {
    viewport: model.viewport,
    rail: rail(h, {
      brand: { letter: "a", label: "amends" },
      items: railItems(model),
      search: { label: "Search", onClick: Message.ClickedSearch() },
      footer: [
        {
          icon: "mark-settings",
          label: "Settings",
          isCurrent: Open.isAnyOf(["Settings"])(model.open),
          onClick: Message.ClickedSettings()
        }
      ]
    }),
    sidebar: sidebarView(model, inputs, h),
    main: mainView(model, now, h),
    ...(Option.isSome(aside)
      ? {
          aside: {
            view: aside.value,
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
      h.block(SearchBinding.embedView({ slotId: "search", model: model.search }))
    ]
  })
})

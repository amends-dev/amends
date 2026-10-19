import { button, hint, iconButton } from "@amends-dev/design/control"
import { pane } from "@amends-dev/design/pane"
import { rail } from "@amends-dev/design/rail"
import { shell } from "@amends-dev/design/shell"
import { sidebar, sidebarFooter, sidebarHeader, sidebarItem, sidebarSection } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { threadView } from "../../feature/group/view.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
import {
  ActionsBinding,
  AgentsBinding,
  ChannelsBinding,
  ConnectionsBinding,
  GroupBinding,
  GroupsBinding,
  InboxBinding,
  SettingsBinding,
  WorkspaceComposition,
  type WorkspaceViewBuilder
} from "./composition.ts"
import { Message, type Model, Open, openThreadTitle } from "./definition.ts"

/** Who is signed in, which the sidebar's footer shows beside the way to sign out. */
export type ViewInputs = Readonly<{ email: string }>

/** The destinations of the rail, as the open workspace shows them. */
const railItems = (model: Model) => [
  {
    icon: "mark-home" as const,
    label: "Home",
    isCurrent: Open.isAnyOf(["Nothing", "Inbox", "Group"])(model.open),
    onClick: Message.ClickedHome()
  },
  {
    icon: "mark-connections" as const,
    label: "Connections",
    isCurrent: Open.isAnyOf(["Connections"])(model.open),
    onClick: Message.ClickedConnections()
  },
  {
    icon: "mark-agents" as const,
    label: "Agents",
    isCurrent: Open.isAnyOf(["Agents"])(model.open),
    onClick: Message.ClickedAgents()
  },
  {
    icon: "mark-channel" as const,
    label: "Channels",
    isCurrent: Open.isAnyOf(["Channels"])(model.open),
    onClick: Message.ClickedChannels()
  }
]

/** The sidebar: the workspace's name, the inbox, the groups, and who is signed in. */
const sidebarView = (model: Model, email: string, h: WorkspaceViewBuilder): Html => {
  const waiting = waitingCount(model.inbox)
  return sidebar(h, {
    label: model.name,
    header: sidebarHeader(h, {
      mark: model.name.slice(0, 1),
      name: model.name,
      actions: [
        iconButton(
          h,
          { icon: "chevron-down", label: "All workspaces", onClick: Message.ClickedAllWorkspaces() },
          { size: "compact" }
        )
      ]
    }),
    children: [
      sidebarSection(h, {
        children: [
          sidebarItem(h, {
            icon: "mark-mail",
            label: "Inbox",
            ...(waiting > 0 ? { count: waiting } : {}),
            isCurrent: Open.isAnyOf(["Inbox"])(model.open),
            onClick: Message.ClickedInbox()
          })
        ]
      }),
      h.block(
        GroupsBinding.embedView({
          slotId: "groups",
          model: model.groups,
          viewInputs: { openThread: openThreadTitle(model.open) }
        })
      )
    ],
    footer: sidebarFooter(h, [hint(h, email), button(h, "Sign out", Message.ClickedSignOut(), { variant: "link" })])
  })
}

/** The main pane: the destination the person opened, or, while they have opened none, the way to pick one. */
const mainView = (model: Model, h: WorkspaceViewBuilder): Html =>
  Open.match(model.open, {
    Nothing: () =>
      pane(h, {
        variant: "main",
        label: model.name,
        header: {
          title: model.name,
          mark: model.name.slice(0, 1),
          subtitle: "Pick a group, or open your inbox."
        },
        body: []
      }),
    Inbox: () => h.block(InboxBinding.embedView({ slotId: "inbox", model: model.inbox })),
    Connections: () => h.block(ConnectionsBinding.embedView({ slotId: "connections", model: model.connections })),
    Agents: () => h.block(AgentsBinding.embedView({ slotId: "agents", model: model.agents })),
    Settings: () => h.block(SettingsBinding.embedView({ slotId: "settings", model: model.settings })),
    Channels: () => h.block(ChannelsBinding.embedView({ slotId: "channels", model: model.channels })),
    Group: ({ groupId, model: open }) => h.block(GroupBinding.embedView({ key: groupId, slotId: "group", model: open }))
  })

/** The side pane: the thread open in the group open, while there is one. */
const asideView = (model: Model, h: WorkspaceViewBuilder): Option.Option<Html> =>
  Open.matchOrElse(
    model.open,
    {
      Group: ({ groupId, model: open }) =>
        Option.isSome(open.thread)
          ? Option.some(
              h.block(GroupBinding.embedView({ key: groupId, slotId: "group-thread", model: open, view: threadView }))
            )
          : Option.none()
    },
    () => Option.none()
  )

/** The open workspace on the shell: the rail of destinations, the sidebar, the main pane, the thread's side pane, and the notices. */
export const view = WorkspaceComposition.makeView.withInputs<ViewInputs>((model, { email }, h) =>
  shell(h, {
    rail: rail(h, {
      brand: { letter: "a", label: "amends" },
      items: railItems(model),
      footer: [
        {
          icon: "mark-settings",
          label: "Settings",
          isCurrent: Open.isAnyOf(["Settings"])(model.open),
          onClick: Message.ClickedSettings()
        }
      ]
    }),
    sidebar: sidebarView(model, email, h),
    main: mainView(model, h),
    ...Option.match(asideView(model, h), { onNone: () => ({}), onSome: (aside) => ({ aside }) }),
    notices: h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions }))
  })
)

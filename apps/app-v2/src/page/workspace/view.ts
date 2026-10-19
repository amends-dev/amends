import { button, hint, iconButton } from "@amends-dev/design/control"
import { pane } from "@amends-dev/design/pane"
import { rail } from "@amends-dev/design/rail"
import { shell } from "@amends-dev/design/shell"
import { sidebar, sidebarFooter, sidebarHeader, sidebarItem, sidebarSection } from "@amends-dev/design/sidebar"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { threadView } from "../../feature/group/view.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
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
  SettingsBinding,
  WorkspaceComposition,
  type WorkspaceViewBuilder
} from "./composition.ts"
import { Message, type Model, nameOf, Open, openThreadTitle } from "./definition.ts"

/**
 * Who is signed in, which the sidebar's footer shows beside the way to sign out, and the time now, which the
 * destinations that show ages and days follow.
 */
export type ViewInputs = Readonly<{ email: string; now: DateTime.Utc }>

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

/**
 * The main pane: the destination the person opened, or, while they have opened none, the way to pick one. The
 * inbox and the open group are given the time now.
 */
const mainView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Html =>
  Open.match(model.open, {
    Nothing: () => {
      const name = nameOf(model)
      return pane(h, {
        variant: "main",
        label: name,
        header: { title: name, mark: name.slice(0, 1), subtitle: "Pick a group, or open your inbox." },
        body: []
      })
    },
    Inbox: () => h.block(InboxBinding.embedView({ slotId: "inbox", model: model.inbox, viewInputs: { now } })),
    Connections: () => h.block(ConnectionsBinding.embedView({ slotId: "connections", model: model.connections })),
    Agents: () => h.block(AgentsBinding.embedView({ slotId: "agents", model: model.agents })),
    Settings: () => h.block(SettingsBinding.embedView({ slotId: "settings", model: model.settings })),
    Channels: () => h.block(ChannelsBinding.embedView({ slotId: "channels", model: model.channels })),
    Group: ({ groupId, model: open }) =>
      h.block(GroupBinding.embedView({ key: groupId, slotId: "group", model: open, viewInputs: { now } }))
  })

/** The side pane: the thread open in the group open, while there is one, given the time now. */
const asideView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Option.Option<Html> =>
  Open.matchOrElse(
    model.open,
    {
      Group: ({ groupId, model: open }) =>
        Option.isSome(open.thread)
          ? Option.some(
              h.block(
                GroupBinding.embedView({
                  key: groupId,
                  slotId: "group-thread",
                  model: open,
                  view: threadView,
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
 * pane lent to the shell.
 */
export const view = WorkspaceComposition.makeView.withInputs<ViewInputs>((model, { email, now }, h) => {
  const aside = asideView(model, now, h)

  return shell(h, {
    viewport: model.viewport,
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
    }
  })
})

/** The workspace shell: navigation, destination panes, notices, and dialogs. */

import { rail } from "@amends-dev/design/rail"
import { shell } from "@amends-dev/design/shell"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Appearance } from "../../../appearance.ts"
import { view as actionsView } from "../../../feature/actions/view.ts"
import { dialogView as agentsDialogView } from "../../../feature/agents/view/dialog.ts"
import { dialogView as connectionsDialogView } from "../../../feature/connections/view/dialog.ts"
import { view as searchView } from "../../../feature/search/view.ts"
import { accountView as settingsAccountView } from "../../../feature/settings/view/account.ts"
import { dialogView as settingsDialogView } from "../../../feature/settings/view/dialog.ts"
import {
  ActionsBinding,
  AgentsBinding,
  ConnectionsBinding,
  HomeBinding,
  MenuBinding,
  SearchBinding,
  SettingsBinding,
  WorkspaceComposition
} from "../composition.ts"
import { Message, type Model, nameOf, Open } from "../definition.ts"
import { dialogView as homeDialogView, profileCardView as homeProfileCardView } from "../home/view/overlay.ts"
import { asideView } from "./aside.ts"
import { mainView } from "./main.ts"
import { sidebarView } from "./sidebar.ts"

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
    sidebar: sidebarView(model, inputs.isApplePlatform, h),
    main: mainView(model, now, h),
    ...(Option.isSome(aside) ? { aside: aside.value } : {}),
    notices: h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions, view: actionsView })),
    menu: {
      id: model.menu.id,
      onOpen: Message.ClickedMenu(),
      isOpen: model.menu.isOpen,
      dialog: (toView) => h.block(MenuBinding.embedView({ slotId: "menu", model: model.menu, viewInputs: { toView } }))
    },
    dialogs: [
      h.block(HomeBinding.embedView({ slotId: "home-profile-card", model: model.home, view: homeProfileCardView })),
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
      h.block(SearchBinding.embedView({ slotId: "search", model: model.search, view: searchView }))
    ]
  })
})

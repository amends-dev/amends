/** The main pane of the workspace’s open destination. */

import type * as DateTime from "effect/DateTime"
import type { Html } from "foldkit/html"
import { agentView } from "../../../feature/agents/view/detail.ts"
import { view as agentsView } from "../../../feature/agents/view/list.ts"
import { view as channelsView } from "../../../feature/channels/view.ts"
import { connectionView } from "../../../feature/connections/view/detail.ts"
import { view as connectionsView } from "../../../feature/connections/view/list.ts"
import { membersView as settingsMembersView } from "../../../feature/settings/view/members.ts"
import { view as settingsWorkspaceView } from "../../../feature/settings/view/workspace.ts"
import {
  AgentsBinding,
  ChannelsBinding,
  ConnectionsBinding,
  HomeBinding,
  SettingsBinding,
  type WorkspaceViewBuilder
} from "../composition.ts"
import { type Model, nameOf, Open, openMemberId } from "../definition.ts"
import { view as homeView } from "../home/view/main.ts"

/**
 * The main pane: the destination the person opened. Home and the settings' members page are given the time now, and
 * Home the workspace's name.
 */
export const mainView = (model: Model, now: DateTime.Utc, h: WorkspaceViewBuilder): Html =>
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
        ? h.block(
            SettingsBinding.embedView({
              slotId: "settings-workspace",
              model: model.settings,
              view: settingsWorkspaceView
            })
          )
        : h.block(
            SettingsBinding.embedView({
              slotId: "settings-members",
              model: model.settings,
              view: settingsMembersView,
              viewInputs: { now, viewport: model.viewport, openMemberId: openMemberId(model) }
            })
          ),
    Channels: () =>
      h.block(ChannelsBinding.embedView({ slotId: "channels", model: model.channels, view: channelsView }))
  })

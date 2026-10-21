import { isAsideInDialog } from "@amends-dev/design/shell"
import type { Viewport } from "@amends-dev/design/viewport"
import * as Update from "foldkit/update"
import {
  AgentsBinding,
  ChannelsBinding,
  ConnectionsBinding,
  goTo,
  HomeBinding,
  hideAside,
  MenuBinding,
  SearchBinding,
  SettingsBinding,
  showAgents,
  showAside,
  showConnections,
  showHome,
  showSettings,
  switchTo,
  WorkspaceComposition
} from "./composition.ts"
import { isMemberOpen, Message, OutMessage, WorkspaceDefinition } from "./definition.ts"

/** Lay the workspace out for a window of the width `viewport`. */
const showViewport = (viewport: Viewport) => WorkspaceDefinition.stepFields(() => ({ viewport: () => viewport }))

/**
 * Put the member open in the settings, if there is one, where the window's width puts the side pane: in its dialog,
 * which opens, or beside the main pane, which closes the dialog without closing the member.
 */
const placeAside = WorkspaceDefinition.step((model) => {
  if (!isMemberOpen(model)) {
    return WorkspaceDefinition.stepNoop()
  }

  if (isAsideInDialog(model.viewport)) {
    return showAside
  }

  return hideAside
})

/** Whether the sidebar is in place at `viewport`, where there is no drawer to keep open. */
const hasSidebarInPlace = (viewport: Viewport): boolean => viewport === "Desktop" || viewport === "Split"

export const update = WorkspaceComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedWorkspaceSwitcher: () => ({ model, outMessage: OutMessage.ClosedWorkspace() }),
    ClickedHome: () => Update.combine(model, [switchTo(showHome)]),
    ClickedConnections: () => Update.combine(model, [switchTo(showConnections)]),
    ClickedAgents: () => Update.combine(model, [switchTo(showAgents)]),
    ClickedSettings: () => Update.combine(model, [switchTo(showSettings("Workspace"))]),
    ClickedWorkspace: () => Update.combine(model, [goTo(showSettings("Workspace"))]),
    ClickedMembers: () => Update.combine(model, [goTo(showSettings("Members"))]),
    ClickedMenu: () => Update.combine(model, [MenuBinding.requestOpen()]),
    ClickedSearch: () => Update.combine(model, [SearchBinding.requestOpen()]),
    RequestedSearch: () => Update.combine(model, [SearchBinding.requestOpen()]),
    CompletedRequestNameChange: () => Update.combine(model, [SettingsBinding.requestNameChange()]),
    InformedOfViewport: ({ viewport }) =>
      Update.combine(model, [
        showViewport(viewport),
        ...(hasSidebarInPlace(viewport) ? [MenuBinding.requestClose()] : []),
        placeAside,
        HomeBinding.informViewport({ viewport })
      ]),
    ReceivedIntegrations: ({ integrations }) =>
      Update.combine(model, [
        ConnectionsBinding.informReceivedIntegrations({ integrations }),
        AgentsBinding.informReceivedIntegrations({ integrations }),
        ChannelsBinding.informReceivedIntegrations({ integrations })
      ]),
    FailedLoadIntegrations: ({ error }) =>
      Update.combine(model, [
        ConnectionsBinding.informFailedLoadIntegrations({ error }),
        AgentsBinding.informFailedLoadIntegrations({ error }),
        ChannelsBinding.informFailedLoadIntegrations({ error })
      ])
  })
)

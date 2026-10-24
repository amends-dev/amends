import { isAsideInDialog } from "@amends-dev/design/shell"
import type { Viewport } from "@amends-dev/design/viewport"
import * as Update from "foldkit/update"
import {
  dismissOverlays,
  AgentsBinding,
  ChannelsBinding,
  ConnectionsBinding,
  goTo,
  HomeBinding,
  hideAside,
  MenuBinding,
  SearchBinding,
  showDestination,
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
const showViewport = (viewport: Viewport) => WorkspaceDefinition.makeFieldsStep(() => ({ viewport: () => viewport }))

/**
 * Put the member open in the settings, if there is one, where the window's width puts the side pane: in its dialog,
 * which opens, or beside the main pane, which closes the dialog without closing the member.
 */
const placeAside = WorkspaceDefinition.makeStep((model) => {
  if (!isMemberOpen(model)) {
    return WorkspaceDefinition.makeNoopStep()
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
    RequestedDestination: ({ destination }) =>
      Update.combineSteps(model, [dismissOverlays, showDestination(destination)]),
    ClickedWorkspaceSwitcher: () => ({ model, outMessage: OutMessage.ClosedWorkspace() }),
    ClickedHome: () => Update.withOutMessage(Update.combineSteps(model, [switchTo(showHome)]), OutMessage.Navigated()),
    ClickedConnections: () =>
      Update.withOutMessage(Update.combineSteps(model, [switchTo(showConnections)]), OutMessage.Navigated()),
    ClickedAgents: () =>
      Update.withOutMessage(Update.combineSteps(model, [switchTo(showAgents)]), OutMessage.Navigated()),
    ClickedSettings: () =>
      Update.withOutMessage(Update.combineSteps(model, [switchTo(showSettings("Workspace"))]), OutMessage.Navigated()),
    ClickedWorkspace: () =>
      Update.withOutMessage(Update.combineSteps(model, [goTo(showSettings("Workspace"))]), OutMessage.Navigated()),
    ClickedMembers: () =>
      Update.withOutMessage(Update.combineSteps(model, [goTo(showSettings("Members"))]), OutMessage.Navigated()),
    ClickedMenu: () => Update.combineSteps(model, [MenuBinding.requestOpen()]),
    ClickedSearch: () => Update.combineSteps(model, [SearchBinding.requestOpen()]),
    RequestedSearch: () => Update.combineSteps(model, [SearchBinding.requestOpen()]),
    InformedOfViewport: ({ viewport }) =>
      Update.combineSteps(model, [
        showViewport(viewport),
        ...(hasSidebarInPlace(viewport) ? [MenuBinding.requestClose()] : []),
        placeAside,
        HomeBinding.informViewport({ viewport })
      ]),
    ReceivedIntegrations: ({ integrations }) =>
      Update.combineSteps(model, [
        ConnectionsBinding.informReceivedIntegrations({ integrations }),
        AgentsBinding.informReceivedIntegrations({ integrations }),
        ChannelsBinding.informReceivedIntegrations({ integrations })
      ]),
    FailedLoadIntegrations: ({ error }) =>
      Update.combineSteps(model, [
        ConnectionsBinding.informFailedLoadIntegrations({ error }),
        AgentsBinding.informFailedLoadIntegrations({ error }),
        ChannelsBinding.informFailedLoadIntegrations({ error })
      ])
  })
)

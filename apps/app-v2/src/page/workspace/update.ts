import type { Viewport } from "@amends-dev/design/viewport"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import {
  AgentsBinding,
  ChannelsBinding,
  ConnectionsBinding,
  GroupsBinding,
  MenuBinding,
  WorkspaceComposition
} from "./composition.ts"
import { Message, Open, OutMessage, WorkspaceDefinition } from "./definition.ts"

/** Show nothing yet in the main content. */
const showNothing = WorkspaceDefinition.step((model) => ({
  model: modifyFields(model, { open: () => Open.Nothing() })
}))

/** Show the inbox in the main content. */
const showInbox = WorkspaceDefinition.step((model) => ({ model: modifyFields(model, { open: () => Open.Inbox() }) }))

/** Show the connections in the main content. */
const showConnections = WorkspaceDefinition.step((model) => ({
  model: modifyFields(model, { open: () => Open.Connections() })
}))

/** Show the agents in the main content. */
const showAgents = WorkspaceDefinition.step((model) => ({ model: modifyFields(model, { open: () => Open.Agents() }) }))

/** Show the settings in the main content. */
const showSettings = WorkspaceDefinition.step((model) => ({
  model: modifyFields(model, { open: () => Open.Settings() })
}))

/** Show the channels in the main content. */
const showChannels = WorkspaceDefinition.step((model) => ({
  model: modifyFields(model, { open: () => Open.Channels() })
}))

/** Go to a destination: close the navigation drawer, leave no group marked in the sidebar, and `show` it. */
const goTo = (show: typeof showNothing) =>
  Update.combine([MenuBinding.requestClose(), GroupsBinding.informOpenGroup({ groupId: Option.none() }), show])

/** Lay the workspace out for a window of the width `viewport`. */
const showViewport = (viewport: Viewport) => WorkspaceDefinition.stepFields(() => ({ viewport: () => viewport }))

/** Whether the sidebar is in place at `viewport`, where there is no drawer to keep open. */
const hasSidebarInPlace = (viewport: Viewport): boolean => viewport === "Desktop" || viewport === "Split"

export const update = WorkspaceComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedAllWorkspaces: () => ({ model, outMessage: OutMessage.ClosedWorkspace() }),
    ClickedSignOut: () => ({ model, outMessage: OutMessage.RequestedSignOut() }),
    ClickedHome: () => Update.combine(model, [goTo(showNothing)]),
    ClickedInbox: () => Update.combine(model, [goTo(showInbox)]),
    ClickedConnections: () => Update.combine(model, [goTo(showConnections)]),
    ClickedAgents: () => Update.combine(model, [goTo(showAgents)]),
    ClickedSettings: () => Update.combine(model, [goTo(showSettings)]),
    ClickedChannels: () => Update.combine(model, [goTo(showChannels)]),
    ClickedMenu: () => Update.combine(model, [MenuBinding.requestOpen()]),
    InformedOfViewport: ({ viewport }) =>
      Update.combine(model, [
        showViewport(viewport),
        ...(hasSidebarInPlace(viewport) ? [MenuBinding.requestClose()] : [])
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

import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { GroupsBinding, WorkspaceComposition } from "./composition.ts"
import { Message, Open, OutMessage, WorkspaceDefinition } from "./definition.ts"

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

export const update = WorkspaceComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedAllWorkspaces: () => ({ model, outMessage: OutMessage.ClosedWorkspace() }),
    ClickedInbox: () => Update.combine(model, [GroupsBinding.informOpenGroup({ groupId: Option.none() }), showInbox]),
    ClickedConnections: () =>
      Update.combine(model, [GroupsBinding.informOpenGroup({ groupId: Option.none() }), showConnections]),
    ClickedAgents: () => Update.combine(model, [GroupsBinding.informOpenGroup({ groupId: Option.none() }), showAgents]),
    ClickedSettings: () =>
      Update.combine(model, [GroupsBinding.informOpenGroup({ groupId: Option.none() }), showSettings]),
    ClickedChannels: () =>
      Update.combine(model, [GroupsBinding.informOpenGroup({ groupId: Option.none() }), showChannels])
  })
)

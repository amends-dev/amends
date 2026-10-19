import { GroupId } from "@amends-dev/core/group"
import type { ThreadId } from "@amends-dev/core/thread"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { LoadIntegrations } from "./command.ts"
import { type Model, Open, WorkspaceDefinition } from "./definition.ts"

/** List the integrations the host installs again, when a Block that showed them failing asks. */
const loadIntegrationsAgain = WorkspaceDefinition.step((model: Model) => ({
  model,
  commands: [LoadIntegrations({ workspaceId: model.workspaceId })]
}))

/** Open the group `groupId` in the main content, with the thread `threadId` open in it, if there is one. */
const openGroup = (groupId: GroupId.GroupId, threadId: Option.Option<ThreadId.ThreadId>) =>
  WorkspaceDefinition.step((model: Model) =>
    GroupBinding.init({
      key: groupId,
      args: [model.workspaceId, model.memberId, groupId, threadId],
      toParentModel: (group) => modifyFields(model, { open: () => Open.Group({ groupId, model: group }) })
    })
  )

/** Picking a group opens it, and closes the navigation drawer. */
const foldGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: ({ groupId }) => Update.combine([MenuBinding.requestClose(), openGroup(groupId, Option.none())])
})

/**
 * Opening a notification's thread opens its group with the thread open, marks the group open in the list, and
 * closes the navigation drawer.
 */
const foldInboxOutMessage = InboxBlock.OutMessage.match({
  OpenedThread: ({ groupId, threadId }) =>
    Update.combine([
      MenuBinding.requestClose(),
      GroupsBinding.informOpenGroup({ groupId: Option.some(groupId) }),
      openGroup(groupId, Option.some(threadId))
    ])
})

/** The navigation drawer's dialog opening, closing, and finishing its close changes nothing else. */
const foldMenuOutMessage = DialogBlock.OutMessage.match({
  Opened: () => WorkspaceDefinition.stepNoop(),
  Closed: () => WorkspaceDefinition.stepNoop(),
  CompletedClose: () => WorkspaceDefinition.stepNoop()
})

export const MenuBinding = WorkspaceDefinition.bindChild(DialogBlock, {
  field: "menu",
  init: { contextToArgs: () => [{ id: "workspace-menu" }] },
  outMessage: { fold: foldMenuOutMessage }
})

export const GroupsBinding = WorkspaceDefinition.bindChild(GroupsBlock, {
  field: "groups",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldGroupsOutMessage }
})

export const ActionsBinding = WorkspaceDefinition.bindChild(ActionsBlock, {
  field: "actions",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] }
})

export const InboxBinding = WorkspaceDefinition.bindChild(InboxBlock, {
  field: "inbox",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: foldInboxOutMessage }
})

export const ConnectionsBinding = WorkspaceDefinition.bindChild(ConnectionsBlock, {
  field: "connections",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: ConnectionsBlock.OutMessage.match({ RequestedIntegrations: () => loadIntegrationsAgain }) }
})

export const AgentsBinding = WorkspaceDefinition.bindChild(AgentsBlock, {
  field: "agents",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: AgentsBlock.OutMessage.match({ RequestedIntegrations: () => loadIntegrationsAgain }) }
})

export const SettingsBinding = WorkspaceDefinition.bindChild(SettingsBlock, {
  field: "settings",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] }
})

export const ChannelsBinding = WorkspaceDefinition.bindChild(ChannelsBlock, {
  field: "channels",
  init: { contextToArgs: ({ workspaceId, memberId }) => [workspaceId, memberId] },
  outMessage: { fold: ChannelsBlock.OutMessage.match({ RequestedIntegrations: () => loadIntegrationsAgain }) }
})

/** The open group, a keyed occurrence, so opening another makes a fresh one and a late result cannot land in the wrong one. */
export const GroupBinding = WorkspaceDefinition.bindChild(GroupBlock, {
  readAll: (model) => (Open.isAnyOf(["Group"])(model.open) ? [model.open] : []),
  key: (open) => open.groupId,
  keySchema: GroupId.GroupId,
  read: (open) => open.model,
  writeAt: (model, groupId, nextGroup) =>
    modifyFields(model, {
      open: (open) =>
        Open.isAnyOf(["Group"])(open) && open.groupId === groupId ? Open.Group({ groupId, model: nextGroup }) : open
    })
})

export const WorkspaceComposition = WorkspaceDefinition.makeComposition({
  bindings: [
    MenuBinding,
    GroupsBinding,
    ActionsBinding,
    InboxBinding,
    ConnectionsBinding,
    AgentsBinding,
    SettingsBinding,
    ChannelsBinding,
    GroupBinding
  ]
})
export type WorkspaceViewBuilder = Block.ViewBuilderFor<typeof WorkspaceComposition>

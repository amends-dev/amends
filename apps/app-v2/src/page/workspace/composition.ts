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
import { isAsideFloating, type Model, Open, WorkspaceDefinition } from "./definition.ts"

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

/** Picking a group opens it without a thread, and closes the navigation drawer and the side pane's dialog. */
const foldGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: ({ groupId }) =>
    Update.combine([MenuBinding.requestClose(), hideAside, openGroup(groupId, Option.none())])
})

/**
 * Opening a notification's thread opens its group with the thread open, marks the group open in the list,
 * closes the navigation drawer, and opens the side pane's dialog where the pane is one.
 */
const foldInboxOutMessage = InboxBlock.OutMessage.match({
  OpenedThread: ({ groupId, threadId }) =>
    Update.combine([
      MenuBinding.requestClose(),
      GroupsBinding.informOpenGroup({ groupId: Option.some(groupId) }),
      openGroup(groupId, Option.some(threadId)),
      showAside
    ])
})

/** The navigation drawer's dialog opening, closing, and finishing its close changes nothing else. */
const foldMenuOutMessage = DialogBlock.OutMessage.match({
  Opened: () => WorkspaceDefinition.stepNoop(),
  Closed: () => WorkspaceDefinition.stepNoop(),
  CompletedClose: () => WorkspaceDefinition.stepNoop()
})

/**
 * The side pane's dialog opening and finishing its close change nothing else. Its closing, by Escape, its scrim,
 * or the page, closes the thread, except at `Split`: there it is the pane moving beside the main pane, not the
 * person leaving the thread.
 */
const foldAsideOutMessage = DialogBlock.OutMessage.match({
  Opened: () => WorkspaceDefinition.stepNoop(),
  Closed: () =>
    WorkspaceDefinition.step((model: Model) =>
      isAsideFloating(model.viewport) ? closeOpenThread : WorkspaceDefinition.stepNoop()
    ),
  CompletedClose: () => WorkspaceDefinition.stepNoop()
})

export const MenuBinding = WorkspaceDefinition.bindChild(DialogBlock, {
  field: "menu",
  init: { contextToArgs: () => [{ id: "workspace-menu" }] },
  outMessage: { fold: foldMenuOutMessage }
})

export const AsideBinding = WorkspaceDefinition.bindChild(DialogBlock, {
  field: "aside",
  init: { contextToArgs: () => [{ id: "workspace-aside" }] },
  outMessage: { fold: foldAsideOutMessage }
})

/** Open the side pane's dialog, where the window's width puts the side pane in one. */
export const showAside = WorkspaceDefinition.step((model: Model) =>
  isAsideFloating(model.viewport) ? AsideBinding.requestOpen() : WorkspaceDefinition.stepNoop()
)

/** Close the side pane's dialog; closing one that is closed does nothing. */
export const hideAside = AsideBinding.requestClose()

/** Close the thread open in the group open, if there is one. */
const closeOpenThread = WorkspaceDefinition.step((model: Model) =>
  Open.matchOrElse(model.open, { Group: ({ groupId }) => GroupBinding.requestCloseThread(groupId) }, () =>
    WorkspaceDefinition.stepNoop()
  )
)

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

/** The open group's thread opening opens the side pane's dialog where the pane is one, and closing it closes it. */
const foldGroupOutMessage = (_groupId: GroupId.GroupId, outMessage: typeof GroupBlock.OutMessage.Type) =>
  GroupBlock.OutMessage.match(outMessage, {
    OpenedThread: () => showAside,
    ClosedThread: () => hideAside
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
    }),
  outMessage: { fold: foldGroupOutMessage }
})

export const WorkspaceComposition = WorkspaceDefinition.makeComposition({
  bindings: [
    MenuBinding,
    AsideBinding,
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

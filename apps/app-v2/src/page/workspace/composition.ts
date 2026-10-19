import { GroupId } from "@amends-dev/core/group"
import type { ThreadId } from "@amends-dev/core/thread"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { type Model, Open, WorkspaceDefinition } from "./definition.ts"

/** Open the group `groupId` in the main content, with the thread `threadId` open in it, if there is one. */
const openGroup = (groupId: GroupId.GroupId, threadId: Option.Option<ThreadId.ThreadId>) =>
  WorkspaceDefinition.step((model: Model) =>
    GroupBinding.init({
      key: groupId,
      args: [model.workspaceId, model.memberId, groupId, threadId],
      toParentModel: (group) => modifyFields(model, { open: () => Open.Group({ groupId, model: group }) })
    })
  )

/** Picking a group opens it. */
const foldGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: ({ groupId }) => openGroup(groupId, Option.none())
})

/** Opening a notification's thread opens its group with the thread open, and marks the group open in the list. */
const foldInboxOutMessage = InboxBlock.OutMessage.match({
  OpenedThread: ({ groupId, threadId }) =>
    Update.combine([
      GroupsBinding.informOpenGroup({ groupId: Option.some(groupId) }),
      openGroup(groupId, Option.some(threadId))
    ])
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
  bindings: [GroupsBinding, ActionsBinding, InboxBinding, GroupBinding]
})
export type WorkspaceViewBuilder = Block.ViewBuilderFor<typeof WorkspaceComposition>

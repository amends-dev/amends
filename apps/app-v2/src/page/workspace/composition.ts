import { GroupId } from "@amends-dev/core/group"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { type Model, WorkspaceDefinition } from "./definition.ts"

/** Picking a group opens it. */
const foldGroupsOutMessage = GroupsBlock.OutMessage.match({
  SelectedGroup: ({ groupId }) =>
    WorkspaceDefinition.step((model: Model) =>
      GroupBinding.init({
        key: groupId,
        args: [model.workspaceId, model.memberId, groupId],
        toParentModel: (group) => modifyFields(model, { group: () => Option.some({ groupId, model: group }) })
      })
    )
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

/** The open group, a keyed occurrence, so opening another makes a fresh one and a late result cannot land in the wrong one. */
export const GroupBinding = WorkspaceDefinition.bindChild(GroupBlock, {
  readAll: (model) => Option.toArray(model.group),
  key: (open) => open.groupId,
  keySchema: GroupId.GroupId,
  read: (open) => open.model,
  writeAt: (model, groupId, nextGroup) =>
    modifyFields(model, {
      group: Option.map((open) => (open.groupId === groupId ? { groupId, model: nextGroup } : open))
    })
})

export const WorkspaceComposition = WorkspaceDefinition.makeComposition({
  bindings: [GroupsBinding, ActionsBinding, GroupBinding]
})
export type WorkspaceViewBuilder = Block.ViewBuilderFor<typeof WorkspaceComposition>

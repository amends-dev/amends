import * as Option from "effect/Option"
import { button } from "../../controls.ts"
import { ActionsBinding, GroupBinding, GroupsBinding, WorkspaceComposition } from "./composition.ts"
import { Message } from "./definition.ts"

export const view = WorkspaceComposition.makeView((model, h) =>
  h.section(
    [h.AriaLabel(model.name)],
    [
      h.h2([], [model.name]),
      button(h, "All workspaces", Message.ClickedAllWorkspaces()),
      h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions })),
      h.block(GroupsBinding.embedView({ slotId: "groups", model: model.groups })),
      Option.match(model.group, {
        onNone: () => h.empty,
        onSome: ({ groupId, model: open }) =>
          h.block(GroupBinding.embedView({ key: groupId, slotId: "group", model: open }))
      })
    ]
  )
)

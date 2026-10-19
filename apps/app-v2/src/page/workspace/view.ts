import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button } from "../../controls.ts"
import {
  ActionsBinding,
  GroupsBinding,
  ThreadBinding,
  ThreadsBinding,
  WorkspaceComposition,
  type WorkspaceViewBuilder
} from "./composition.ts"
import { Message, type Pane } from "./definition.ts"

/** The open group's threads, or the thread open among them. */
const paneView = (pane: Pane, h: WorkspaceViewBuilder): Html =>
  Option.match(pane.thread, {
    onNone: () => h.block(ThreadsBinding.embedView({ key: pane.groupId, slotId: "threads", model: pane.threads })),
    onSome: ({ threadId, model }) =>
      h.div(
        [],
        [
          button(h, "All threads", Message.ClickedAllThreads()),
          h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread", model }))
        ]
      )
  })

export const view = WorkspaceComposition.makeView((model, h) =>
  h.section(
    [h.AriaLabel(model.name)],
    [
      h.h2([], [model.name]),
      button(h, "All workspaces", Message.ClickedAllWorkspaces()),
      h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions })),
      h.block(GroupsBinding.embedView({ slotId: "groups", model: model.groups })),
      Option.match(model.pane, { onNone: () => h.empty, onSome: (pane) => paneView(pane, h) })
    ]
  )
)

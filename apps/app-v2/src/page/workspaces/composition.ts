import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { Creating, WorkspacesDefinition } from "./definition.ts"

/** Stop creating, whether the workspace was or not. */
export const leaveCreating = WorkspacesDefinition.stepFields(() => ({ create: () => Option.none() }))

export const DialogBinding = WorkspacesDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "create-workspace" }] },
  outMessage: {
    /**
     * The dialog closing, by the person or by Escape, ends what was being created, except while the request is on
     * its way: a workspace is not created unseen, so the dialog opens again to show how the request ends.
     */
    fold: (outMessage, { modelBeforeUpdate }) =>
      DialogBlock.OutMessage.match(outMessage, {
        Opened: () => WorkspacesDefinition.stepNoop(),
        Closed: () =>
          Option.exists(modelBeforeUpdate.create, Creating.isAnyOf(["Sending"]))
            ? DialogBinding.requestOpen()
            : leaveCreating,
        CompletedClose: () => WorkspacesDefinition.stepNoop()
      })
  }
})

export const WorkspacesComposition = WorkspacesDefinition.makeComposition({ bindings: [DialogBinding] })
export type WorkspacesViewBuilder = Block.ViewBuilderFor<typeof WorkspacesComposition>

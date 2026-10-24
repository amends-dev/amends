import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { SelectOnFocus } from "./command.ts"
import { Entering, WorkspacesDefinition } from "./definition.ts"

/** Stop what the person was doing in the dialog, whether the workspace was created or joined or not. */
export const leaveEntering = WorkspacesDefinition.makeFieldsStep(() => ({ entering: () => Option.none() }))

export const DialogBinding = WorkspacesDefinition.makeBinding(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "enter-workspace" }] }
}).withOutMessagePolicy({
  /**
   * The dialog closing, by the person or by Escape, ends what was being done, except while a request is on its
   * way: a workspace is not created, nor an invitation accepted, unseen, so the dialog opens again to show how
   * the request ends.
   */
  fold: (outMessage, { modelBeforeUpdate }) =>
    DialogBlock.OutMessage.match(outMessage, {
      Opened: () => WorkspacesDefinition.makeNoopStep(),
      Closed: () =>
        Option.exists(modelBeforeUpdate.entering, Entering.isAnyOf(["SendingCreate", "SendingJoin"]))
          ? DialogBinding.requestOpen()
          : leaveEntering,
      CompletedClose: () => WorkspacesDefinition.makeNoopStep()
    })
})

export const WorkspacesComposition = WorkspacesDefinition.makeComposition({
  bindings: [DialogBinding],
  mounts: [SelectOnFocus]
})
export type WorkspacesViewBuilder = Block.ViewBuilderFor<typeof WorkspacesComposition>

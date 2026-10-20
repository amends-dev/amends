import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { ConnectionsDefinition, isDialogBusy } from "./definition.ts"

/** Stop what the person was doing in the dialog, whether the connection was added, replaced, or removed or not. */
export const leaveDialog = ConnectionsDefinition.stepFields(() => ({
  adding: () => Option.none(),
  replacing: () => Option.none(),
  removing: () => Option.none()
}))

export const DialogBinding = ConnectionsDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "connections-dialog" }] },
  outMessage: {
    /**
     * The dialog closing, by the person or by Escape, ends what was being done, except while a request is on its
     * way: a connection is not added, nor its key replaced, nor it removed, unseen, so the dialog opens again to show
     * how the request ends.
     */
    fold: (outMessage, { modelBeforeUpdate }) =>
      DialogBlock.OutMessage.match(outMessage, {
        Opened: () => ConnectionsDefinition.stepNoop(),
        Closed: () => (isDialogBusy(modelBeforeUpdate) ? DialogBinding.requestOpen() : leaveDialog),
        CompletedClose: () => ConnectionsDefinition.stepNoop()
      })
  }
})

export const ConnectionsComposition = ConnectionsDefinition.makeComposition({ bindings: [DialogBinding] })
export type ConnectionsViewBuilder = Block.ViewBuilderFor<typeof ConnectionsComposition>

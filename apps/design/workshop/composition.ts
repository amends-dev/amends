import { DialogBlock } from "@foldkit/ui/dialog"
import type { Block } from "foldkit"
import { ApplicationDefinition } from "./definition.ts"

const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => ApplicationDefinition.stepNoop(),
  Closed: () => ApplicationDefinition.stepNoop(),
  CompletedClose: () => ApplicationDefinition.stepNoop()
})

export const ModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "modal",
  init: { contextToArgs: () => [{ id: "workshop-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const WideModalBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: "wideModal",
  init: { contextToArgs: () => [{ id: "workshop-wide-modal" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [ModalBinding, WideModalBinding]
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>

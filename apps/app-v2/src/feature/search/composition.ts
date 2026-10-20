import { DialogBlock } from "@foldkit/ui/dialog"
import type { Block } from "foldkit"
import { SearchDefinition } from "./definition.ts"

/** Forget what was typed, and which item was active. What was read of the places stays, to show as the search opens. */
export const clearQuery = SearchDefinition.stepFields(() => ({
  query: () => "",
  activeIndex: () => 0
}))

/** The dialog closing, by the person or by an item opened, ends the search. */
const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => SearchDefinition.stepNoop(),
  Closed: () => clearQuery,
  CompletedClose: () => SearchDefinition.stepNoop()
})

export const DialogBinding = SearchDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "search" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const SearchComposition = SearchDefinition.makeComposition({ bindings: [DialogBinding] })
export type SearchViewBuilder = Block.ViewBuilderFor<typeof SearchComposition>

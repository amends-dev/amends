import { DialogBlock } from "@foldkit/ui/dialog"
import type { Block } from "foldkit"
import { SearchDefinition } from "./definition.ts"

/** Forget what was typed, and which item was active. What was read of the places stays, to show as the search opens. */
export const clearQuery = SearchDefinition.makeFieldsStep(() => ({
  query: () => "",
  activeIndex: () => 0
}))

/** The dialog closing, by the person or by an item opened, ends the search. */
const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => SearchDefinition.makeNoopStep(),
  Closed: () => clearQuery,
  CompletedClose: () => SearchDefinition.makeNoopStep()
})

export const DialogBinding = SearchDefinition.makeBinding(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "search" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

export const SearchComposition = SearchDefinition.makeComposition({ bindings: [DialogBinding] })
export type SearchViewBuilder = Block.ViewBuilderFor<typeof SearchComposition>

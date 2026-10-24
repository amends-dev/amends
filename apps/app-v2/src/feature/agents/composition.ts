import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { AgentsDefinition, isDialogBusy } from "./definition.ts"

/** Stop what the person was doing in the dialog, whether the agent was added or removed or not. */
export const leaveDialog = AgentsDefinition.makeFieldsStep(() => ({
  adding: () => Option.none(),
  removing: () => Option.none()
}))

export const DialogBinding = AgentsDefinition.makeBinding(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "agents-dialog" }] }
}).withOutMessagePolicy({
  /**
   * The dialog closing, by the person or by Escape, ends what was being done, except while a request is on its
   * way: an agent is not added, nor removed, unseen, so the dialog opens again to show how the request ends.
   */
  fold: (outMessage, { modelBeforeUpdate }) =>
    DialogBlock.OutMessage.match(outMessage, {
      Opened: () => AgentsDefinition.makeNoopStep(),
      Closed: () => (isDialogBusy(modelBeforeUpdate) ? DialogBinding.requestOpen() : leaveDialog),
      CompletedClose: () => AgentsDefinition.makeNoopStep()
    })
})

export const AgentsComposition = AgentsDefinition.makeComposition({ bindings: [DialogBinding] })
export type AgentsViewBuilder = Block.ViewBuilderFor<typeof AgentsComposition>

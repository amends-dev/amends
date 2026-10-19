import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { GroupsDefinition } from "./definition.ts"

/** The dialog closing, by the person or by the form's own submit, ends what was being started. */
const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => GroupsDefinition.stepNoop(),
  Closed: () => GroupsDefinition.stepFields(() => ({ starting: () => Option.none() })),
  CompletedClose: () => GroupsDefinition.stepNoop()
})

export const DialogBinding = GroupsDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "groups-starting" }] },
  outMessage: { fold: foldDialogOutMessage }
})

export const GroupsComposition = GroupsDefinition.makeComposition({ bindings: [DialogBinding] })
export type GroupsViewBuilder = Block.ViewBuilderFor<typeof GroupsComposition>

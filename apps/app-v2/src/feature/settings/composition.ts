import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { SelectOnFocus } from "./command.ts"
import { isDialogBusy, MemberStatusMenu, SettingsDefinition } from "./definition.ts"

/** Stop what the person was doing in the dialog, whether the request in it was made or not. */
export const leaveDialog = SettingsDefinition.stepFields(() => ({ entering: () => Option.none() }))

export const DialogBinding = SettingsDefinition.bindChild(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "settings-dialog" }] },
  outMessage: {
    /**
     * The dialog closing, by the person or by Escape, ends what was being done, except while a request is on its way:
     * an invitation is not created, nor a member removed, nor the workspace handed over, unseen, so the dialog opens
     * again to show how the request ends.
     */
    fold: (outMessage, { modelBeforeUpdate }) =>
      DialogBlock.OutMessage.match(outMessage, {
        Opened: () => SettingsDefinition.stepNoop(),
        Closed: () => (isDialogBusy(modelBeforeUpdate) ? DialogBinding.requestOpen() : leaveDialog),
        CompletedClose: () => SettingsDefinition.stepNoop()
      })
  }
})

export const MemberStatusBinding = SettingsDefinition.bindChild(MemberStatusMenu, {
  field: "statusMenu",
  init: { contextToArgs: () => [{ id: "member-status" }] },
  outMessage: {
    /** Choosing whether the roster lists those who are in the workspace or who left narrows it to them. */
    fold: MemberStatusMenu.OutMessage.match({
      Selected: ({ value }) =>
        SettingsDefinition.stepFields(() => ({ filter: (filter) => ({ ...filter, status: value }) })),
      Closed: () => SettingsDefinition.stepNoop()
    })
  }
})

export const SettingsComposition = SettingsDefinition.makeComposition({
  bindings: [DialogBinding, MemberStatusBinding],
  mounts: [SelectOnFocus]
})
export type SettingsViewBuilder = Block.ViewBuilderFor<typeof SettingsComposition>

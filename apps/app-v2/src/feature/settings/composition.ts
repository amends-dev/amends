import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type { Block } from "foldkit"
import * as Update from "foldkit/update"
import { SelectOnFocus } from "./command.ts"
import {
  AccountMenu,
  Entering,
  findMember,
  isDialogBusy,
  MemberStatusMenu,
  type Model,
  OutMessage,
  ownName,
  ReportedAccountEntry,
  SettingsDefinition
} from "./definition.ts"

/** Stop what the person was doing in the dialog, whether the request in it was made or not. */
export const leaveDialog = SettingsDefinition.makeFieldsStep(() => ({ entering: () => Option.none() }))

export const DialogBinding = SettingsDefinition.makeBinding(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "settings-dialog" }] }
}).withOutMessagePolicy({
  /**
   * The dialog closing, by the person or by Escape, ends what was being done, except while a request is on its way:
   * an invitation is not created, nor a member removed, nor the workspace handed over, unseen, so the dialog opens
   * again to show how the request ends.
   */
  fold: (outMessage, { modelBeforeUpdate }) =>
    DialogBlock.OutMessage.match(outMessage, {
      Opened: () => SettingsDefinition.makeNoopStep(),
      Closed: () => (isDialogBusy(modelBeforeUpdate) ? DialogBinding.requestOpen() : leaveDialog),
      CompletedClose: () => SettingsDefinition.makeNoopStep()
    })
})

export const MemberStatusBinding = SettingsDefinition.makeBinding(MemberStatusMenu, {
  field: "statusMenu",
  init: { contextToArgs: () => [{ id: "member-status" }] }
}).withOutMessagePolicy({
  /** Choosing whether the roster lists those who are in the workspace or who left narrows it to them. */
  fold: MemberStatusMenu.OutMessage.match({
    Selected: ({ value }) =>
      SettingsDefinition.makeFieldsStep(() => ({ filter: (filter) => ({ ...filter, status: value }) })),
    Closed: () => SettingsDefinition.makeNoopStep()
  })
})

/** Ask for the dialog, doing `entering`. */
export const openDialog = (entering: Entering) =>
  Update.combineSteps([
    SettingsDefinition.makeFieldsStep(() => ({ entering: () => Option.some(entering) })),
    DialogBinding.requestOpen()
  ])

/** Ask for the dialog that changes the person's own name, from the one they have, once the replica holds them. */
export const askToChangeName = SettingsDefinition.makeStep((model: Model) =>
  Option.isSome(findMember(model, model.memberId))
    ? openDialog(Entering.ChangingName({ name: ownName(model), isSending: false, failure: Option.none() }))
    : SettingsDefinition.makeNoopStep()
)

/**
 * Choosing to change their name opens the dialog that does it; every other entry of the account menu is reported, for
 * the workspace page and the app to act on.
 */
export const AccountBinding = SettingsDefinition.makeBinding(AccountMenu, {
  field: "accountMenu",
  init: { contextToArgs: () => [{ id: "account" }] }
}).withOutMessagePolicy({
  forward: AccountMenu.OutMessage.match({
    Selected: ({ value }) =>
      Schema.is(ReportedAccountEntry)(value) ? OutMessage.ChoseAccountEntry({ entry: value }) : undefined,
    Closed: () => undefined
  }),
  fold: AccountMenu.OutMessage.match({
    Selected: ({ value }) => (value === "ChangeName" ? askToChangeName : SettingsDefinition.makeNoopStep()),
    Closed: () => SettingsDefinition.makeNoopStep()
  })
})

export const SettingsComposition = SettingsDefinition.makeComposition({
  bindings: [DialogBinding, MemberStatusBinding, AccountBinding],
  mounts: [SelectOnFocus]
})
export type SettingsViewBuilder = Block.ViewBuilderFor<typeof SettingsComposition>

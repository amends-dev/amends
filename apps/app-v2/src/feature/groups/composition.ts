import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { MembersComboboxBlock } from "../../control/memberPicker.ts"
import {
  GroupsDefinition,
  type Model,
  onMemberIds,
  others,
  startingMembersId,
  teamVisibilityId,
  VisibilityRadioGroupBlock,
  withTeam
} from "./definition.ts"

/** The dialog closing, by the person or by the form's own submit, ends what was being started. */
const foldDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => GroupsDefinition.makeNoopStep(),
  Closed: () =>
    Update.combineSteps([
      GroupsDefinition.makeFieldsStep(() => ({ starting: () => Option.none() })),
      MembersBinding.requestClose()
    ]),
  CompletedClose: () => GroupsDefinition.makeNoopStep()
})

export const DialogBinding = GroupsDefinition.makeBinding(DialogBlock, {
  field: "dialog",
  init: { contextToArgs: () => [{ id: "groups-starting" }] }
}).withOutMessagePolicy({ fold: foldDialogOutMessage })

/** The visibility chosen is the new team's. */
const foldVisibilityOutMessage = VisibilityRadioGroupBlock.OutMessage.match({
  Selected: ({ value }) =>
    GroupsDefinition.makeStep((model: Model) => ({
      model: withTeam(model, (team) => ({ ...team, visibility: value }))
    }))
})

export const VisibilityBinding = GroupsDefinition.makeBinding(VisibilityRadioGroupBlock, {
  field: "visibilityGroup",
  init: { contextToArgs: () => [{ id: teamVisibilityId }] }
}).withOutMessagePolicy({ fold: foldVisibilityOutMessage })

/**
 * Choosing a member adds them to the team or the conversation being started, unless they are not one of the people who
 * may be added or are in it already. The combobox does not empty the text typed once a choice is made, so the list is
 * closed and opened again, which empties it and leaves the list open for the next choice.
 */
const foldMembersOutMessage = MembersComboboxBlock.OutMessage.match({
  Selected: ({ value }) =>
    Update.combineSteps([
      GroupsDefinition.makeStep((model: Model) => {
        const member = others(model).find(({ id }) => id === value)

        return {
          model:
            member === undefined
              ? model
              : modifyFields(model, {
                  starting: onMemberIds((memberIds) =>
                    memberIds.includes(member.id) ? memberIds : [...memberIds, member.id]
                  )
                })
        }
      }),
      MembersBinding.requestClose(),
      MembersBinding.requestOpen()
    ]),
  ClearedSelection: () => GroupsDefinition.makeNoopStep()
})

export const MembersBinding = GroupsDefinition.makeBinding(MembersComboboxBlock, {
  field: "membersCombobox",
  init: { contextToArgs: () => [{ id: startingMembersId }] }
}).withOutMessagePolicy({ fold: foldMembersOutMessage })

export const GroupsComposition = GroupsDefinition.makeComposition({
  bindings: [DialogBinding, VisibilityBinding, MembersBinding]
})
export type GroupsViewBuilder = Block.ViewBuilderFor<typeof GroupsComposition>

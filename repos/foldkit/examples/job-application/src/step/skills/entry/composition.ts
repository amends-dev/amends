import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  Message,
  type Model,
  ProficiencyRadioGroup,
  SkillsEntryDefinition,
} from './definition'

const proficiencyRadioGroupId = (entryId: string): string =>
  `${entryId}-proficiency`

const foldProficiencyRadioGroupOutMessage =
  ProficiencyRadioGroup.OutMessage.match<
    Update.Step<Model, Message>,
    typeof ProficiencyRadioGroup.OutMessage.Type
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { proficiency: () => value }),
      }),
  })

export const ProficiencyRadioGroupBinding = SkillsEntryDefinition.bindChild(
  ProficiencyRadioGroup,
  {
    field: 'proficiencyRadioGroup',
    init: {
      contextToArgs: entryId => [{ id: proficiencyRadioGroupId(entryId) }],
    },
    outMessage: { fold: foldProficiencyRadioGroupOutMessage },
  },
)

export const SkillsEntryComposition = SkillsEntryDefinition.makeComposition({
  bindings: [ProficiencyRadioGroupBinding],
})

import { Option } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  EducationEntryDefinition,
  GraduationYearListboxBlock,
  Message,
  type Model,
} from './definition'

const foldGraduationYearListboxOutMessage =
  GraduationYearListboxBlock.OutMessage.match<Update.Step<Model, Message>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeGraduationYear: () => Option.some(value),
        }),
      }),
  })

export const GraduationYearListboxBinding = EducationEntryDefinition.bindChild(
  GraduationYearListboxBlock,
  {
    field: 'graduationYearListbox',
    init: {
      contextToArgs: entryId => [{ id: `${entryId}-graduation-year` }],
    },
    outMessage: { fold: foldGraduationYearListboxOutMessage },
  },
)

export const EducationEntryComposition =
  EducationEntryDefinition.makeComposition({
    bindings: [GraduationYearListboxBinding],
  })

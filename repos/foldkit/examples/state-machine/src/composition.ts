import type { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'
import { Message } from './message'
import {
  EDITION_RADIO_GROUP_ID,
  EditionRadioGroupBlock,
  HARDCOVER_EDITION,
} from './model'
import { stepMachine } from './transition'

const foldEditionRadioGroupOutMessage = EditionRadioGroupBlock.OutMessage.match(
  {
    Selected: ({ value }) =>
      stepMachine(
        Message.SelectedEdition({
          isShippingRequired: value === HARDCOVER_EDITION,
        }),
      ),
  },
)

export const EditionRadioGroupBinding = ApplicationDefinition.bindChild(
  EditionRadioGroupBlock,
  {
    field: 'editionRadioGroup',
    init: { contextToArgs: () => [{ id: EDITION_RADIO_GROUP_ID }] },
    outMessage: { fold: foldEditionRadioGroupOutMessage },
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [EditionRadioGroupBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>

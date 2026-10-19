import { Array } from 'effect'
import { type Block, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { EducationDefinition, Message, type Model } from './definition'
import { EducationEntryBlock } from './entry'

const foldEntryOutMessage = (
  entryId: string,
  outMessage: typeof EducationEntryBlock.OutMessage.Type,
) =>
  EducationEntryBlock.OutMessage.match<Update.Step<Model, Message>>(
    outMessage,
    {
      Removed: () => model => ({
        model: modifyFields(model, {
          entries: Array.filter(entry => entry.id !== entryId),
        }),
      }),
    },
  )

export const EntriesBinding = EducationDefinition.bindChild(
  EducationEntryBlock,
  {
    field: 'entries',
    key: 'id',
    init: {
      instances: ({ initialEntryId }) => [
        { key: initialEntryId, args: [initialEntryId] },
      ],
      toItem: (_occurrence, entry) => entry,
    },
    outMessage: { fold: foldEntryOutMessage },
  },
)

export const EducationComposition = EducationDefinition.makeComposition({
  bindings: [EntriesBinding],
})
export type EducationViewBuilder = Block.ViewBuilderFor<
  typeof EducationComposition
>

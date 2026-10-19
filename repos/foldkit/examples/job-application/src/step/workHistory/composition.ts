import { Array } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Message, type Model, WorkHistoryDefinition } from './definition'
import { WorkHistoryEntryBlock } from './entry'

const foldEntryOutMessage = (
  entryId: string,
  outMessage: typeof WorkHistoryEntryBlock.OutMessage.Type,
) =>
  WorkHistoryEntryBlock.OutMessage.match<Update.Step<Model, Message>>(
    outMessage,
    {
      Removed: () => model => ({
        model: modifyFields(model, {
          entries: Array.filter(entry => entry.id !== entryId),
        }),
      }),
    },
  )

export const EntriesBinding = WorkHistoryDefinition.bindChild(
  WorkHistoryEntryBlock,
  {
    field: 'entries',
    key: 'id',
    init: {
      instances: ({ today, initialEntryId }) => [
        { key: initialEntryId, args: [initialEntryId, today] },
      ],
      toItem: (_occurrence, entry) => entry,
    },
    outMessage: { fold: foldEntryOutMessage },
  },
)

export const WorkHistoryComposition = WorkHistoryDefinition.makeComposition({
  bindings: [EntriesBinding],
})

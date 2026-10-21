import { Array } from 'effect'
import { type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Message, type Model, SkillsDefinition } from './definition'
import { SkillsEntryBlock } from './entry'

const foldEntryOutMessage = (
  entryId: string,
  outMessage: typeof SkillsEntryBlock.OutMessage.Type,
) =>
  SkillsEntryBlock.OutMessage.match<Update.Step<Model, Message>>(outMessage, {
    Removed: () => model => ({
      model: modifyFields(model, {
        entries: Array.filter(entry => entry.id !== entryId),
      }),
    }),
  })

export const EntriesBinding = SkillsDefinition.bindChild(SkillsEntryBlock, {
  field: 'entries',
  key: 'id',
  init: {
    instances: initialEntryId => [
      { key: initialEntryId, args: [initialEntryId] },
    ],
    toItem: (_occurrence, entry) => entry,
  },
  outMessage: { fold: foldEntryOutMessage },
})

export const SkillsComposition = SkillsDefinition.makeComposition({
  bindings: [EntriesBinding],
})

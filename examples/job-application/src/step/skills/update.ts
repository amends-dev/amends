import { Array } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { GenerateSkillsEntryId } from './command'
import { EntriesBinding, SkillsComposition } from './composition'
import { Message, type Model } from './definition'
import {
  hasErrors as entryHasErrors,
  isComplete as isEntryComplete,
} from './entry/update'

export const update = SkillsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedAddEntry: () => ({ model, commands: [GenerateSkillsEntryId()] }),

    SucceededGenerateSkillsEntryId: ({ entryId }) =>
      EntriesBinding.init({
        key: entryId,
        args: [entryId],
        toParentModel: entry =>
          modifyFields(model, { entries: Array.append(entry) }),
      }),

    FailedGenerateSkillsEntryId: () => ({ model }),

    RemovedEntry: ({ entryId }) => ({
      model: modifyFields(model, {
        entries: Array.filter(entry => entry.id !== entryId),
      }),
    }),

    RequestedRevealErrors: () =>
      Update.combine(
        model,
        Array.map(model.entries, entry =>
          EntriesBinding.requestRevealErrors(entry.id),
        ),
      ),
  }),
)

export const hasErrors = (model: Model): boolean =>
  Array.some(model.entries, entryHasErrors)

export const isComplete = (model: Model): boolean =>
  Array.isReadonlyArrayNonEmpty(model.entries) &&
  Array.every(model.entries, isEntryComplete)

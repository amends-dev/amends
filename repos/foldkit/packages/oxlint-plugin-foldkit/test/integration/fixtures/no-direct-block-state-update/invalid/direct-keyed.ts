import { Array, Option, Schema } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import * as KeyedEntry from './keyedEntry'

const Model = Schema.Struct({ entries: Schema.Array(KeyedEntry.Model) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotEntryMessage: { id: Schema.String, message: KeyedEntry.Message },
  ClickedUpdateEntryManually: {},
})
const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
const EntriesBinding = ApplicationDefinition.bindChild(KeyedEntry.Entry, {
  field: 'entries',
  key: 'id',
  toParentMessage: (id, message) =>
    Message.GotEntryMessage({ id, message }),
  fromParentMessage: {
    parentMessage: Message.GotEntryMessage,
    args: (_model, { id, message }) => Option.some([id, message]),
  },
})
const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [EntriesBinding],
})

export const updateEntryManually = ApplicationComposition.makeUpdate(model => {
  const nextModel = modifyFields(model, {
    entries: Array.map(entry =>
      modifyFields(entry, { theme: () => 'Dark' }),
    ),
  })
  void nextModel

  return EntriesBinding.informThemeChanged('initial', 'Light')(model)
})

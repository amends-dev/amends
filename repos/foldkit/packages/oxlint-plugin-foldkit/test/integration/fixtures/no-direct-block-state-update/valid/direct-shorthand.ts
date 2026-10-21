import { Option, Schema } from 'effect'
import { Update, makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

import * as BoundSettings from './boundSettings'
import * as KeyedEntry from './keyedEntry'

const Model = Schema.Struct({
  entries: Schema.Array(KeyedEntry.Model),
  maybeSettings: Schema.Option(BoundSettings.Model),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClickedApplyThemes: {},
})
const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
const EntriesBinding = ApplicationDefinition.bindChild(KeyedEntry.KeyedEntryBlock, {
  field: 'entries',
  key: 'id',
})
const MaybeSettingsBinding = ApplicationDefinition.bindChild(
  BoundSettings.BoundSettingsBlock,
  { field: 'maybeSettings' },
)
const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [EntriesBinding, MaybeSettingsBinding],
})

export const initial: Model = Model.make({
  entries: [],
  maybeSettings: Option.none(),
})

export const updateWithNamedOperations = ApplicationComposition.makeUpdate(model =>
  Update.combine(model, [
    EntriesBinding.informThemeChanged('initial', { theme: 'Light' }),
    MaybeSettingsBinding.informThemeChanged({ theme: 'Dark' }),
  ])
)

import { Option, Schema } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as BoundSettings from './boundSettings'

const Model = Schema.Struct({ settings: BoundSettings.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClickedApplyTheme: {},
})
const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
const SettingsBinding = ApplicationDefinition.bindChild(
  BoundSettings.BoundSettingsBlock,
  {
    read: (model: Model) => Option.some(model.settings),
    write: (model, nextSettings) =>
      modifyFields(model, { settings: () => nextSettings }),
  },
)
const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [SettingsBinding],
})
export const updateBinding = ApplicationComposition.makeUpdate(model =>
  SettingsBinding.informThemeChanged({ theme: 'Light' })(model),
)

import { Schema } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import * as BoundSettings from './boundSettings'

const Model = Schema.Struct({ settings: BoundSettings.Model })
const Message = defineMessageUnion({
  ChangedTheme: {},
  GotSettingsMessage: { message: BoundSettings.Message },
})
const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
const SettingsBinding = ApplicationDefinition.bindChild(BoundSettings.Settings, {
  field: 'settings',
  parentMessage: Message.GotSettingsMessage,
  init: true,
})
const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [SettingsBinding],
})

export const update = ApplicationComposition.makeUpdate(model => {
  const settingsChange = BoundSettings.setTheme(model.settings, 'Light')

  return {
    model: modifyFields(model, {
      settings: () => settingsChange.model,
    }),
  }
})

export const updateDirectly = ApplicationComposition.makeUpdate(model => ({
  model: modifyFields(model, {
    settings: settings =>
      modifyFields(settings, { theme: () => 'Light' }),
  }),
}))

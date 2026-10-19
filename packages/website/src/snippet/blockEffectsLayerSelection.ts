import { Effect } from 'effect'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { SaveTheme } from './blockDefinition'
import { ApplicationDefinition, Message, Model } from './blockProfileContract'
import * as Settings from './blockSettings'

const SettingsDemo = Settings.SettingsBlock.replaceEffectsLayer(
  SaveTheme.toLayer(
    Effect.succeed(() =>
      Effect.succeed(Settings.SettingsBlock.Message.CompletedSaveTheme()),
    ),
  ),
)

const foldSettingsOutMessage = Settings.SettingsBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ChangedTheme:
    ({ theme }) =>
    model => ({
      model: modifyFields(model, { previewTheme: () => theme }),
    }),
})

export const SettingsBinding = ApplicationDefinition.bindChild(SettingsDemo, {
  field: 'settings',
  outMessage: { fold: foldSettingsOutMessage },
})

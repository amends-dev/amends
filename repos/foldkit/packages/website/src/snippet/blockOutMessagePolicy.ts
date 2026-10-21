import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { ApplicationDefinition, Message, Model } from './blockProfileContract'
import * as Settings from './blockSettings'

const foldSettingsOutMessage = Settings.SettingsBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  ChangedTheme:
    ({ theme }) =>
    model => ({
      model: modifyFields(model, { previewTheme: () => theme }),
    }),
})

export const SettingsBinding = ApplicationDefinition.bindChild(
  Settings.SettingsBlock,
  {
    field: 'settings',
    outMessage: { fold: foldSettingsOutMessage },
  },
)

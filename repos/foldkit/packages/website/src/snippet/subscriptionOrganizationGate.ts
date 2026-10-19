import { ApplicationDefinition } from './definition'
import * as Settings from './settings'

export const SettingsBinding = ApplicationDefinition.bindChild(
  Settings.SettingsBlock,
  {
    field: 'settings',
    subscriptions: {
      when: ({ route }) => route._tag === 'Settings',
    },
  },
)

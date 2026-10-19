import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Settings } from './settings'

// MESSAGE

const Message = defineMessageUnion({
  GotSettingsMessage: {
    key: Schema.String,
    message: Settings.Message,
    displayName: Schema.String,
  },
})

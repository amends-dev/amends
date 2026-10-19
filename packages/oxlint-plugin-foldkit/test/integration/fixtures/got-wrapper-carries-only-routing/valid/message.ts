import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Counter } from './counter'

// MESSAGE

const Message = defineMessageUnion({
  GotCounterMessage: {
    key: Schema.String,
    message: Counter.Message,
    workspaceId: Schema.String,
  },
})

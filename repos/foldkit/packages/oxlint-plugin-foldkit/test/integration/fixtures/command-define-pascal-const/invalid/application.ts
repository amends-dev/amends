import { Schema } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Model = Schema.Struct({ value: Schema.String })
const Message = defineMessageUnion({ CompletedFetchUser: {} })
const ApplicationDefinition = makeApplicationDefinition({ Model, Message })

export const SaveUser = ApplicationDefinition.command('FetchUser', {
  messages: [Message.CompletedFetchUser],
})

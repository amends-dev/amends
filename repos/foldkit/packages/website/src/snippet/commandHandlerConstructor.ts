import { HttpClient } from 'effect/http'
import { makeApplicationDefinition } from 'foldkit'

import { Message, Model, fetchCount } from './counterHttpCommand'

const ApplicationDefinition = makeApplicationDefinition({ Model, Message })

export const FetchCount = ApplicationDefinition.command('FetchCount', {
  messages: [Message.SucceededFetchCount, Message.FailedFetchCount],
  handler: function* () {
    const client = yield* HttpClient.HttpClient

    return () => fetchCount(client)
  },
})

export const EffectsLayer = FetchCount.layer

import { makeApplicationDefinition } from 'foldkit'

import { Flags } from './flags'
import { Message } from './message'
import { Model } from './model'

export const ApplicationDefinition = makeApplicationDefinition({
  Model,
  Message,
  ChildInitContext: Flags,
})

import { makeApplicationDefinition } from 'foldkit'

import { Message } from './message'
import { Model } from './model'

export const ApplicationDefinition = makeApplicationDefinition({
  Model,
  Message,
})

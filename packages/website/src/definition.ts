import { makeApplicationDefinition } from 'foldkit'

import { ChildInitContext } from './childInitContext'
import { Message } from './message'
import { Model } from './model'

export const ApplicationDefinition = makeApplicationDefinition({
  Model,
  Message,
  ChildInitContext,
})

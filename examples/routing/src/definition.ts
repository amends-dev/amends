import { makeApplicationDefinition } from 'foldkit'

import { Message } from './message'
import { Model } from './model'
import { ApplicationRoute } from './route'

export const ApplicationDefinition = makeApplicationDefinition({
  Model,
  Message,
  ChildInitContext: ApplicationRoute.People,
})

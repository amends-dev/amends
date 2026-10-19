import { Schema } from 'effect'

import { CounterBlock } from './island'
import { ApplicationRoute } from './route'

export const Model = Schema.Struct({
  route: ApplicationRoute,
  counter: CounterBlock.Model,
})
export type Model = typeof Model.Type

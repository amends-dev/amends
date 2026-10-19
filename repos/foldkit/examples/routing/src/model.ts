import { Schema } from 'effect'

import { PeopleBlock } from './page'
import { ApplicationRoute } from './route'

export const Model = Schema.Struct({
  route: ApplicationRoute,
  peoplePage: PeopleBlock.Model,
})

export type Model = typeof Model.Type

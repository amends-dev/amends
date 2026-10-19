import { Schema } from 'effect'

import { ApplicationRoute } from './route'
import { UiBlock } from './ui'

export const Model = Schema.Struct({
  route: ApplicationRoute,
  uiModel: UiBlock.Model,
})

export type Model = typeof Model.Type

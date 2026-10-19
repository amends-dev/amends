import { Schema } from 'effect'

import { LoggedInBlock, LoggedOutBlock } from './page'

export const Model = Schema.Union([LoggedOutBlock.Model, LoggedInBlock.Model])

export type Model = typeof Model.Type

import { taggedStruct } from 'foldkit/schema'

import { LoggedOutRoute } from '../../route'
import { LoginBlock } from './page/login'

export const Model = taggedStruct('LoggedOut', {
  route: LoggedOutRoute,
  loginModel: LoginBlock.Model,
})

export type Model = typeof Model.Type

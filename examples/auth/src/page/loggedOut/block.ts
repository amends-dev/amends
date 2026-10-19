import { LoggedOutComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const LoggedOutBlock = LoggedOutComposition.assembleBlock({
  init,
  update,
  view,
})

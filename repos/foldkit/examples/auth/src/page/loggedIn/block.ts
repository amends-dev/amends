import { LoggedInComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const LoggedInBlock = LoggedInComposition.assembleBlock({
  init,
  update,
  view,
})

import { ComingFromReactComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const ComingFromReactBlock = ComingFromReactComposition.assembleBlock({
  init,
  update,
  view,
})

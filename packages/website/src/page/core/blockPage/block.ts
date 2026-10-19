import { BlockPageComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const BlockPageBlock = BlockPageComposition.assembleBlock({
  init,
  update,
  view,
})

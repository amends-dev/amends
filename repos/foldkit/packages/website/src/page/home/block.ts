import { HomeComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export { view } from './view'

export const HomeBlock = HomeComposition.assembleBlock({
  init,
  update,
  view,
})

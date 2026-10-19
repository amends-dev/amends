import { HomeComposition } from './composition'
import { init } from './init'
import { EffectsLayer } from './layer'
import { subscriptions } from './subscription'
import { update } from './update'
import { view } from './view'

export const HomeBlock = HomeComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer,
})

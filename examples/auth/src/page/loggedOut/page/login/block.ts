import { LoginComposition } from './composition'
import { EffectsLayer, init, update } from './login'
import { view } from './view'

export const LoginBlock = LoginComposition.assembleBlock({
  init,
  update,
  view,
  EffectsLayer,
})

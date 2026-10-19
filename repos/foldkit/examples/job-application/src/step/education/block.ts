import { EffectsLayer } from './command'
import { EducationComposition } from './composition'
import { Message } from './definition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const EducationBlock = EducationComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestRevealErrors: Message.RequestedRevealErrors },
  EffectsLayer,
})

import { EffectsLayer } from './command'
import { PersonalInfoComposition } from './composition'
import { Message } from './definition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const PersonalInfoBlock = PersonalInfoComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestRevealErrors: Message.RequestedRevealErrors },
  EffectsLayer,
})

import { EffectsLayer } from './command'
import { SkillsComposition } from './composition'
import { Message } from './definition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const SkillsBlock = SkillsComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestRevealErrors: Message.RequestedRevealErrors },
  EffectsLayer,
})

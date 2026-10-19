import { SkillsEntryComposition } from './composition'
import { Message } from './definition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const SkillsEntryBlock = SkillsEntryComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestRevealErrors: Message.RequestedRevealErrors },
})

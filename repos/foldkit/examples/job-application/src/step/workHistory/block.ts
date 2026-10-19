import { EffectsLayer } from './command'
import { WorkHistoryComposition } from './composition'
import { Message } from './definition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const WorkHistoryBlock = WorkHistoryComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestRevealErrors: Message.RequestedRevealErrors },
  EffectsLayer,
})

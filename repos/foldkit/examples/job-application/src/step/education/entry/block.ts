import { EducationEntryComposition } from './composition'
import { Message } from './definition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const EducationEntryBlock = EducationEntryComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestRevealErrors: Message.RequestedRevealErrors },
})

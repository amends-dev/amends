import { AttachmentsComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'

export const AttachmentsBlock = AttachmentsComposition.assembleBlock({
  init,
  update,
  view,
})

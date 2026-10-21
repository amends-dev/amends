import { UiComposition } from './composition'
import { init } from './init'
import { Message } from './message'
import { update } from './update'

export const UiBlock = UiComposition.assembleBlock({
  init,
  update,
  operations: {
    requestOpenMobileMenu: Message.RequestedOpenMobileMenu,
    requestCloseMobileMenu: Message.RequestedCloseMobileMenu,
  },
})

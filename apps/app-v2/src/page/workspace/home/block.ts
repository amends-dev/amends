import { HomeComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view/main.ts"

const HomeBlockValue = HomeComposition.assembleBlock({
  init,
  update,
  view,
  operations: {
    requestDestination: Message.RequestedDestination,
    requestReset: Message.RequestedReset,
    requestOpenGroup: Message.RequestedOpenGroup,
    requestOpenThread: Message.RequestedOpenThread,
    requestConversationWith: Message.RequestedConversationWith,
    informViewport: Message.InformedOfViewport
  }
})
type HomeBlockType = typeof HomeBlockValue
export interface HomeBlock extends HomeBlockType {}
export const HomeBlock: HomeBlock = HomeBlockValue

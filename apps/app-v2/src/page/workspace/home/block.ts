import { Block } from "foldkit"
import { HomeComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view/main.ts"

const prepare = () =>
  HomeComposition.prepareBlock({
    init,
    update,
    view,
    operations: {
      requestDestination: Message.RequestedDestination,
      requestDismiss: Message.RequestedDismiss,
      requestReset: Message.RequestedReset,
      requestOpenGroup: Message.RequestedOpenGroup,
      requestOpenThread: Message.RequestedOpenThread,
      requestConversationWith: Message.RequestedConversationWith,
      informViewport: Message.InformedOfViewport
    }
  })
const HomeBlockValue: Block.FromAssemblyWithViewAndOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type HomeBlockType = typeof HomeBlockValue
export interface HomeBlock extends HomeBlockType {}
export const HomeBlock: HomeBlock = HomeBlockValue

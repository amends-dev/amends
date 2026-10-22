import * as Layer from "effect/Layer"
import { Dismiss, ExpireConfirmation } from "./command.ts"
import { ActionsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: { confirm: Message.Confirmed },
  EffectsLayer: Layer.mergeAll(Dismiss.layer, ExpireConfirmation.layer, subscriptions.layer)
}

const ActionsBlockValue = ActionsComposition.assembleBlock<typeof implementation>(implementation)
type ActionsBlockType = typeof ActionsBlockValue
export interface ActionsBlock extends ActionsBlockType {}
export const ActionsBlock: ActionsBlock = ActionsBlockValue

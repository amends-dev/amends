import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { Dismiss, ExpireConfirmation } from "./command.ts"
import { ActionsComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
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

const prepare = () => ActionsComposition.prepareBlock(implementation)
const ActionsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type ActionsBlockType = typeof ActionsBlockValue
export interface ActionsBlock extends ActionsBlockType {}
export const ActionsBlock: ActionsBlock = ActionsBlockValue

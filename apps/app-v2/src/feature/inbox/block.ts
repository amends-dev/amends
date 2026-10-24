import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { InboxComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: {
    requestCloseThread: Message.RequestedCloseThread,
    requestSelection: Message.RequestedSelection,
    requestTab: Message.RequestedTab
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => InboxComposition.prepareBlock(implementation)
const InboxBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type InboxBlockType = typeof InboxBlockValue
export interface InboxBlock extends InboxBlockType {}
export const InboxBlock: InboxBlock = InboxBlockValue

import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { InboxComposition } from "./composition.ts"
import { Message } from "./definition.ts"
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

const InboxBlockValue = InboxComposition.assembleBlock<typeof implementation>(implementation)
type InboxBlockType = typeof InboxBlockValue
export interface InboxBlock extends InboxBlockType {}
export const InboxBlock: InboxBlock = InboxBlockValue

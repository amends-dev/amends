import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { ConnectionsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: {
    informReceivedIntegrations: Message.ReceivedIntegrations,
    informFailedLoadIntegrations: Message.FailedLoadIntegrations
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const ConnectionsBlockValue = ConnectionsComposition.assembleBlock<typeof implementation>(implementation)
type ConnectionsBlockType = typeof ConnectionsBlockValue
export interface ConnectionsBlock extends ConnectionsBlockType {}
export const ConnectionsBlock: ConnectionsBlock = ConnectionsBlockValue

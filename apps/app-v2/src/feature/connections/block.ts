import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ConnectionsComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: {
    requestDismiss: Message.RequestedDismiss,
    requestBrowseTab: Message.ChoseBrowseTab,
    informReceivedIntegrations: Message.ReceivedIntegrations,
    informFailedLoadIntegrations: Message.FailedLoadIntegrations
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => ConnectionsComposition.prepareBlock(implementation)
const ConnectionsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type ConnectionsBlockType = typeof ConnectionsBlockValue
export interface ConnectionsBlock extends ConnectionsBlockType {}
export const ConnectionsBlock: ConnectionsBlock = ConnectionsBlockValue

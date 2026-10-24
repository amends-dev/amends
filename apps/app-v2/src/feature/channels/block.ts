import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ChannelsComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
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

const prepare = () => ChannelsComposition.prepareBlock(implementation)
const ChannelsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type ChannelsBlockType = typeof ChannelsBlockValue
export interface ChannelsBlock extends ChannelsBlockType {}
export const ChannelsBlock: ChannelsBlock = ChannelsBlockValue

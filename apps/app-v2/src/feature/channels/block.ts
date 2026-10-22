import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { ChannelsComposition } from "./composition.ts"
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

const ChannelsBlockValue = ChannelsComposition.assembleBlock<typeof implementation>(implementation)
type ChannelsBlockType = typeof ChannelsBlockValue
export interface ChannelsBlock extends ChannelsBlockType {}
export const ChannelsBlock: ChannelsBlock = ChannelsBlockValue

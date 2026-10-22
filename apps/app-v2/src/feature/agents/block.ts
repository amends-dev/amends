import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { AgentsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: {
    requestBrowseTab: Message.ChoseBrowseTab,
    informReceivedIntegrations: Message.ReceivedIntegrations,
    informFailedLoadIntegrations: Message.FailedLoadIntegrations
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const AgentsBlockValue = AgentsComposition.assembleBlock<typeof implementation>(implementation)
type AgentsBlockType = typeof AgentsBlockValue
export interface AgentsBlock extends AgentsBlockType {}
export const AgentsBlock: AgentsBlock = AgentsBlockValue

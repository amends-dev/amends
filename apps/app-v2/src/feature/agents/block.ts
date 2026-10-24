import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { AgentsComposition } from "./composition.ts"
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

const prepare = () => AgentsComposition.prepareBlock(implementation)
const AgentsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type AgentsBlockType = typeof AgentsBlockValue
export interface AgentsBlock extends AgentsBlockType {}
export const AgentsBlock: AgentsBlock = AgentsBlockValue

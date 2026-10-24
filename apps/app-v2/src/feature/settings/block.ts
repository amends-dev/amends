import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { SettingsComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: { requestDismiss: Message.RequestedDismiss, requestNameChange: Message.RequestedNameChange },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => SettingsComposition.prepareBlock(implementation)
const SettingsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type SettingsBlockType = typeof SettingsBlockValue
export interface SettingsBlock extends SettingsBlockType {}
export const SettingsBlock: SettingsBlock = SettingsBlockValue

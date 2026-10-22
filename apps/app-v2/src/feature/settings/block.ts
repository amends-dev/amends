import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { SettingsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
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

const SettingsBlockValue = SettingsComposition.assembleBlock<typeof implementation>(implementation)
type SettingsBlockType = typeof SettingsBlockValue
export interface SettingsBlock extends SettingsBlockType {}
export const SettingsBlock: SettingsBlock = SettingsBlockValue

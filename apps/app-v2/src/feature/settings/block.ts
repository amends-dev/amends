import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { SettingsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const SettingsBlockValue = SettingsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: { requestNameChange: Message.RequestedNameChange },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type SettingsBlockType = typeof SettingsBlockValue
export interface SettingsBlock extends SettingsBlockType {}
export const SettingsBlock: SettingsBlock = SettingsBlockValue

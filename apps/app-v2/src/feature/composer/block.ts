import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { ComposerComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const ComposerBlockValue = ComposerComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer)
})
type ComposerBlockType = typeof ComposerBlockValue
export interface ComposerBlock extends ComposerBlockType {}
export const ComposerBlock: ComposerBlock = ComposerBlockValue

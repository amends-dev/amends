import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { TurnsComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const TurnsBlockValue = TurnsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type TurnsBlockType = typeof TurnsBlockValue
export interface TurnsBlock extends TurnsBlockType {}
export const TurnsBlock: TurnsBlock = TurnsBlockValue

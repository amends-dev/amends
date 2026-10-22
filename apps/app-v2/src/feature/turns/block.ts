import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { TurnsComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const TurnsBlockValue = TurnsComposition.assembleBlock<typeof implementation>(implementation)
type TurnsBlockType = typeof TurnsBlockValue
export interface TurnsBlock extends TurnsBlockType {}
export const TurnsBlock: TurnsBlock = TurnsBlockValue

import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { TurnsComposition } from "./composition.ts"
import type { Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => TurnsComposition.prepareBlock(implementation)
const TurnsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type TurnsBlockType = typeof TurnsBlockValue
export interface TurnsBlock extends TurnsBlockType {}
export const TurnsBlock: TurnsBlock = TurnsBlockValue

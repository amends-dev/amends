import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ThreadComposition } from "./composition.ts"
import type { Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer)
}

const prepare = () => ThreadComposition.prepareBlock(implementation)
const ThreadBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type ThreadBlockType = typeof ThreadBlockValue
export interface ThreadBlock extends ThreadBlockType {}
export const ThreadBlock: ThreadBlock = ThreadBlockValue

import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { ThreadComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer)
}

const ThreadBlockValue = ThreadComposition.assembleBlock<typeof implementation>(implementation)
type ThreadBlockType = typeof ThreadBlockValue
export interface ThreadBlock extends ThreadBlockType {}
export const ThreadBlock: ThreadBlock = ThreadBlockValue

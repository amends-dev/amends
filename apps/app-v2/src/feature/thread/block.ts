import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { ThreadComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const ThreadBlock = ThreadComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer)
})

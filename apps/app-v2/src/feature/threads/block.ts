import * as Layer from "effect/Layer"
import { StartThread } from "./command.ts"
import { ThreadsComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const ThreadsBlock = ThreadsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(StartThread.layer, subscriptions.layer)
})

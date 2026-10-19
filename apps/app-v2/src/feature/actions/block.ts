import * as Layer from "effect/Layer"
import { Dismiss } from "./command.ts"
import { ActionsComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const ActionsBlock = ActionsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(Dismiss.layer, subscriptions.layer)
})

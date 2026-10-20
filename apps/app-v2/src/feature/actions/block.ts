import * as Layer from "effect/Layer"
import { Dismiss, ExpireConfirmation } from "./command.ts"
import { ActionsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const ActionsBlock = ActionsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: { confirm: Message.Confirmed },
  EffectsLayer: Layer.mergeAll(Dismiss.layer, ExpireConfirmation.layer, subscriptions.layer)
})

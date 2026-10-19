import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { GroupComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const GroupBlock = GroupComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: { requestCloseThread: Message.RequestedCloseThread },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})

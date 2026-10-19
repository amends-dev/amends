import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { ConnectionsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const ConnectionsBlock = ConnectionsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: {
    informReceivedIntegrations: Message.ReceivedIntegrations,
    informFailedLoadIntegrations: Message.FailedLoadIntegrations
  },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})

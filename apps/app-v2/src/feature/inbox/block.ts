import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { InboxComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const InboxBlockValue = InboxComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: { requestCloseThread: Message.RequestedCloseThread },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type InboxBlockType = typeof InboxBlockValue
export interface InboxBlock extends InboxBlockType {}
export const InboxBlock: InboxBlock = InboxBlockValue

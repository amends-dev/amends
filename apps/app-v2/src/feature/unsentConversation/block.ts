import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { UnsentConversationComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const UnsentConversationBlockValue = UnsentConversationComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type UnsentConversationBlockType = typeof UnsentConversationBlockValue
export interface UnsentConversationBlock extends UnsentConversationBlockType {}
export const UnsentConversationBlock: UnsentConversationBlock = UnsentConversationBlockValue

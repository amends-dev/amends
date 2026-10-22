import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { UnsentConversationComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const UnsentConversationBlockValue = UnsentConversationComposition.assembleBlock<typeof implementation>(implementation)
type UnsentConversationBlockType = typeof UnsentConversationBlockValue
export interface UnsentConversationBlock extends UnsentConversationBlockType {}
export const UnsentConversationBlock: UnsentConversationBlock = UnsentConversationBlockValue

import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { UnsentConversationComposition } from "./composition.ts"
import type { Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => UnsentConversationComposition.prepareBlock(implementation)
const UnsentConversationBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> =
  Block.assemble(prepare)
type UnsentConversationBlockType = typeof UnsentConversationBlockValue
export interface UnsentConversationBlock extends UnsentConversationBlockType {}
export const UnsentConversationBlock: UnsentConversationBlock = UnsentConversationBlockValue

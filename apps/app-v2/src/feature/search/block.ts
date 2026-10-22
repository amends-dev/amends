import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { SearchComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: { requestOpen: Message.RequestedOpen },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const SearchBlockValue = SearchComposition.assembleBlock<typeof implementation>(implementation)
type SearchBlockType = typeof SearchBlockValue
export interface SearchBlock extends SearchBlockType {}
export const SearchBlock: SearchBlock = SearchBlockValue

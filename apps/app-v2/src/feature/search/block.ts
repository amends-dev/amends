import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { SearchComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const SearchBlockValue = SearchComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  operations: { requestOpen: Message.RequestedOpen },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type SearchBlockType = typeof SearchBlockValue
export interface SearchBlock extends SearchBlockType {}
export const SearchBlock: SearchBlock = SearchBlockValue

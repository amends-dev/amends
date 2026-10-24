import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { SearchComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: { requestDismiss: Message.RequestedDismiss, requestOpen: Message.RequestedOpen },
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => SearchComposition.prepareBlock(implementation)
const SearchBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type SearchBlockType = typeof SearchBlockValue
export interface SearchBlock extends SearchBlockType {}
export const SearchBlock: SearchBlock = SearchBlockValue

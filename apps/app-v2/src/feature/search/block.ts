import { EffectsLayer } from "./command.ts"
import { SearchComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const SearchBlock = SearchComposition.assembleBlock({
  init,
  update,
  view,
  operations: { requestOpen: Message.RequestedOpen },
  EffectsLayer
})

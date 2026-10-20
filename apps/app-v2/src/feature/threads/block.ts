import * as Layer from "effect/Layer"
import { FocusComposer, StartThread } from "./command.ts"
import { ThreadsComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const ThreadsBlockValue = ThreadsComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(StartThread.layer, FocusComposer.layer, subscriptions.layer)
})
type ThreadsBlockType = typeof ThreadsBlockValue
export interface ThreadsBlock extends ThreadsBlockType {}
export const ThreadsBlock: ThreadsBlock = ThreadsBlockValue

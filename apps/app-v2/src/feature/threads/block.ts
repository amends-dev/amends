import * as Layer from "effect/Layer"
import { FocusComposer, ScrollThreadsToEnd, StartThread } from "./command.ts"
import { ThreadsComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  operations: { requestTab: Message.ChoseTab },
  EffectsLayer: Layer.mergeAll(StartThread.layer, FocusComposer.layer, ScrollThreadsToEnd.layer, subscriptions.layer)
}

const ThreadsBlockValue = ThreadsComposition.assembleBlock<typeof implementation>(implementation)
type ThreadsBlockType = typeof ThreadsBlockValue
export interface ThreadsBlock extends ThreadsBlockType {}
export const ThreadsBlock: ThreadsBlock = ThreadsBlockValue

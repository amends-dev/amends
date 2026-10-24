import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { FocusComposer, ScrollThreadsToEnd, StartThread } from "./command.ts"
import { ThreadsComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
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

const prepare = () => ThreadsComposition.prepareBlock(implementation)
const ThreadsBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type ThreadsBlockType = typeof ThreadsBlockValue
export interface ThreadsBlock extends ThreadsBlockType {}
export const ThreadsBlock: ThreadsBlock = ThreadsBlockValue

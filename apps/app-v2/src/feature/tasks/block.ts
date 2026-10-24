import { Block } from "foldkit"
import { TasksComposition } from "./composition.ts"
import type { Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: subscriptions.layer
}

const prepare = () => TasksComposition.prepareBlock(implementation)
const TasksBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type TasksBlockType = typeof TasksBlockValue
export interface TasksBlock extends TasksBlockType {}
export const TasksBlock: TasksBlock = TasksBlockValue

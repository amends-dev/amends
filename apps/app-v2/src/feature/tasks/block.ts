import { TasksComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: subscriptions.layer
}

const TasksBlockValue = TasksComposition.assembleBlock<typeof implementation>(implementation)
type TasksBlockType = typeof TasksBlockValue
export interface TasksBlock extends TasksBlockType {}
export const TasksBlock: TasksBlock = TasksBlockValue

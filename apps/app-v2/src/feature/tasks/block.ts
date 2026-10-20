import { TasksComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { tasksView } from "./view.ts"

const TasksBlockValue = TasksComposition.assembleBlock({
  init,
  update,
  view: tasksView,
  subscriptions,
  EffectsLayer: subscriptions.layer
})
type TasksBlockType = typeof TasksBlockValue
export interface TasksBlock extends TasksBlockType {}
export const TasksBlock: TasksBlock = TasksBlockValue

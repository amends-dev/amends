import { TasksComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { tasksView } from "./view.ts"

export const TasksBlock = TasksComposition.assembleBlock({
  init,
  update,
  view: tasksView,
  subscriptions,
  EffectsLayer: subscriptions.layer
})

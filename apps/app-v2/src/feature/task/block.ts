import * as Layer from "effect/Layer"
import { EffectsLayer } from "./command.ts"
import { TaskComposition } from "./composition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const TaskBlockValue = TaskComposition.assembleBlock({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
})
type TaskBlockType = typeof TaskBlockValue
export interface TaskBlock extends TaskBlockType {}
export const TaskBlock: TaskBlock = TaskBlockValue

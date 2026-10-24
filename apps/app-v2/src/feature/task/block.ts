import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { TaskComposition } from "./composition.ts"
import type { Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const implementation = {
  init,
  update,
  subscriptions,
  EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
}

const prepare = () => TaskComposition.prepareBlock(implementation)
const TaskBlockValue: Block.FromAssemblyWithoutViewOrOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type TaskBlockType = typeof TaskBlockValue
export interface TaskBlock extends TaskBlockType {}
export const TaskBlock: TaskBlock = TaskBlockValue

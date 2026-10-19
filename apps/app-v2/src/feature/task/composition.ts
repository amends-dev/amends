import type { Block } from "foldkit"
import { TaskDefinition } from "./definition.ts"

export const TaskComposition = TaskDefinition.makeComposition({})
export type TaskViewBuilder = Block.ViewBuilderFor<typeof TaskComposition>

import type { Block } from "foldkit"
import { TasksDefinition } from "./definition.ts"

export const TasksComposition = TasksDefinition.makeComposition({})
export type TasksViewBuilder = Block.ViewBuilderFor<typeof TasksComposition>

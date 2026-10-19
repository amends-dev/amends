import type { Block } from "foldkit"
import { AgentsDefinition } from "./definition.ts"

export const AgentsComposition = AgentsDefinition.makeComposition({})
export type AgentsViewBuilder = Block.ViewBuilderFor<typeof AgentsComposition>

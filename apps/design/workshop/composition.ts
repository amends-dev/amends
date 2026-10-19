import type { Block } from "foldkit"
import { ApplicationDefinition } from "./definition.ts"

export const ApplicationComposition = ApplicationDefinition.makeComposition()
export type ApplicationViewBuilder = Block.ViewBuilderFor<typeof ApplicationComposition>

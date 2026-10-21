import type { Block } from "foldkit"
import { TurnsDefinition } from "./definition.ts"

export const TurnsComposition = TurnsDefinition.makeComposition({})
export type TurnsViewBuilder = Block.ViewBuilderFor<typeof TurnsComposition>

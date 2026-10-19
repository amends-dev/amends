import type { Block } from "foldkit"
import { GroupsDefinition } from "./definition.ts"

export const GroupsComposition = GroupsDefinition.makeComposition({})
export type GroupsViewBuilder = Block.ViewBuilderFor<typeof GroupsComposition>

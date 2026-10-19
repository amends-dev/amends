import type { Block } from "foldkit"
import { ConnectionsDefinition } from "./definition.ts"

export const ConnectionsComposition = ConnectionsDefinition.makeComposition({})
export type ConnectionsViewBuilder = Block.ViewBuilderFor<typeof ConnectionsComposition>

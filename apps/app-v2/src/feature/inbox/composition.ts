import type { Block } from "foldkit"
import { InboxDefinition } from "./definition.ts"

export const InboxComposition = InboxDefinition.makeComposition({})
export type InboxViewBuilder = Block.ViewBuilderFor<typeof InboxComposition>

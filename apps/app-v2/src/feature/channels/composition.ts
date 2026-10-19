import type { Block } from "foldkit"
import { ChannelsDefinition } from "./definition.ts"

export const ChannelsComposition = ChannelsDefinition.makeComposition({})
export type ChannelsViewBuilder = Block.ViewBuilderFor<typeof ChannelsComposition>

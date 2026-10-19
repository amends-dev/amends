import type { Block } from "foldkit"
import { SettingsDefinition } from "./definition.ts"

export const SettingsComposition = SettingsDefinition.makeComposition({})
export type SettingsViewBuilder = Block.ViewBuilderFor<typeof SettingsComposition>

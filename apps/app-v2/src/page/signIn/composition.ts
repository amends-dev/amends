import type { Block } from "foldkit"
import { SignInDefinition } from "./definition.ts"

export const SignInComposition = SignInDefinition.makeComposition({})
export type SignInViewBuilder = Block.ViewBuilderFor<typeof SignInComposition>

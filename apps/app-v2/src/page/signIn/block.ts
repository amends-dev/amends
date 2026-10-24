import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { SignInComposition } from "./composition.ts"
import type { Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const prepare = () => SignInComposition.prepareBlock({ init, update, view, EffectsLayer })
const SignInBlockValue: Block.FromAssemblyWithViewAndOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type SignInBlockType = typeof SignInBlockValue
export interface SignInBlock extends SignInBlockType {}
export const SignInBlock: SignInBlock = SignInBlockValue

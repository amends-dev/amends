import { EffectsLayer } from "./command.ts"
import { SignInComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const SignInBlockValue = SignInComposition.assembleBlock({ init, update, view, EffectsLayer })
type SignInBlockType = typeof SignInBlockValue
export interface SignInBlock extends SignInBlockType {}
export const SignInBlock: SignInBlock = SignInBlockValue

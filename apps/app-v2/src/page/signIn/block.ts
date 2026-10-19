import { EffectsLayer } from "./command.ts"
import { SignInComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const SignInBlock = SignInComposition.assembleBlock({ init, update, view, EffectsLayer })

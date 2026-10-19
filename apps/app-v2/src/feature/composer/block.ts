import { EffectsLayer } from "./command.ts"
import { ComposerComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const ComposerBlock = ComposerComposition.assembleBlock({ init, update, view, EffectsLayer })

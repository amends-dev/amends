import { EffectsLayer } from "./command.ts"
import { ComposerComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const ComposerBlockValue = ComposerComposition.assembleBlock({ init, update, view, EffectsLayer })
type ComposerBlockType = typeof ComposerBlockValue
export interface ComposerBlock extends ComposerBlockType {}
export const ComposerBlock: ComposerBlock = ComposerBlockValue

import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ComposerComposition, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"

const prepare = () =>
  ComposerComposition.prepareBlock({
    init,
    update,
    subscriptions,
    EffectsLayer: Layer.mergeAll(EffectsLayer, subscriptions.layer)
  })
const ComposerBlockValue: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
type ComposerBlockType = typeof ComposerBlockValue
export interface ComposerBlock extends ComposerBlockType {}
export const ComposerBlock: ComposerBlock = ComposerBlockValue

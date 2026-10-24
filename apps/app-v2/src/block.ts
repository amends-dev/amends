import * as Layer from "effect/Layer"
import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { ApplicationComposition } from "./composition.ts"
import { init } from "./init.ts"
import type { Model } from "./model.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const prepare = () =>
  ApplicationComposition.prepareBlock({
    init,
    update,
    view,
    subscriptions,
    EffectsLayer: Layer.merge(EffectsLayer, subscriptions.layer)
  })
const ApplicationBlockValue: Block.FromAssemblyWithView<typeof Model, typeof prepare> = Block.assemble(prepare)
type ApplicationBlockType = typeof ApplicationBlockValue
export interface ApplicationBlock extends ApplicationBlockType {}
export const ApplicationBlock: ApplicationBlock = ApplicationBlockValue

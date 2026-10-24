import { Block } from "foldkit"
import { EffectsLayer } from "./command.ts"
import { WorkspacesComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view/main.ts"

const prepare = () =>
  WorkspacesComposition.prepareBlock({
    init,
    update,
    view,
    operations: { requestReload: Message.ClickedTryAgain },
    EffectsLayer
  })
const WorkspacesBlockValue: Block.FromAssemblyWithViewAndOutMessage<typeof Model, typeof prepare> =
  Block.assemble(prepare)
type WorkspacesBlockType = typeof WorkspacesBlockValue
export interface WorkspacesBlock extends WorkspacesBlockType {}
export const WorkspacesBlock: WorkspacesBlock = WorkspacesBlockValue

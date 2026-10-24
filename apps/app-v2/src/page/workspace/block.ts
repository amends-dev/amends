import { Block } from "foldkit"
import { LoadIntegrations } from "./command.ts"
import { WorkspaceComposition } from "./composition.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view/shell.ts"

const prepare = () =>
  WorkspaceComposition.prepareBlock({
    init,
    update,
    view,
    operations: {
      requestDestination: Message.RequestedDestination,
      informViewport: Message.InformedOfViewport,
      requestSearch: Message.RequestedSearch
    },
    EffectsLayer: LoadIntegrations.layer
  })
const WorkspaceBlockValue: Block.FromAssemblyWithViewAndOutMessage<typeof Model, typeof prepare> =
  Block.assemble(prepare)
type WorkspaceBlockType = typeof WorkspaceBlockValue
export interface WorkspaceBlock extends WorkspaceBlockType {}
export const WorkspaceBlock: WorkspaceBlock = WorkspaceBlockValue

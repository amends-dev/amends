import { LoadIntegrations } from "./command.ts"
import { WorkspaceComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const WorkspaceBlockValue = WorkspaceComposition.assembleBlock({
  init,
  update,
  view,
  operations: {
    informViewport: Message.InformedOfViewport,
    requestSearch: Message.RequestedSearch
  },
  EffectsLayer: LoadIntegrations.layer
})
type WorkspaceBlockType = typeof WorkspaceBlockValue
export interface WorkspaceBlock extends WorkspaceBlockType {}
export const WorkspaceBlock: WorkspaceBlock = WorkspaceBlockValue

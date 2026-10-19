import { LoadIntegrations } from "./command.ts"
import { WorkspaceComposition } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const WorkspaceBlock = WorkspaceComposition.assembleBlock({
  init,
  update,
  view,
  operations: { informViewport: Message.InformedOfViewport, requestSearch: Message.RequestedSearch },
  EffectsLayer: LoadIntegrations.layer
})

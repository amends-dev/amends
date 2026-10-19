import { WorkspaceComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const WorkspaceBlock = WorkspaceComposition.assembleBlock({ init, update, view })

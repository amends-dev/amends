import { EffectsLayer } from "./command.ts"
import { WorkspacesComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view/main.ts"

const WorkspacesBlockValue = WorkspacesComposition.assembleBlock({ init, update, view, EffectsLayer })
type WorkspacesBlockType = typeof WorkspacesBlockValue
export interface WorkspacesBlock extends WorkspacesBlockType {}
export const WorkspacesBlock: WorkspacesBlock = WorkspacesBlockValue

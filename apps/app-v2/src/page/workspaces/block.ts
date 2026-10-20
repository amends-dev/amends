import { EffectsLayer } from "./command.ts"
import { WorkspacesComposition } from "./composition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

export const WorkspacesBlock = WorkspacesComposition.assembleBlock({ init, update, view, EffectsLayer })

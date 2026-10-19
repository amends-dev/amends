import { LoadWorkspaces } from "./command.ts"
import { WorkspacesComposition } from "./composition.ts"
import { Model, Workspaces } from "./definition.ts"

/** The listing as it starts. */
export const init = WorkspacesComposition.makeInit(() => ({
  model: Model.make({ workspaces: Workspaces.Loading() }),
  commands: [LoadWorkspaces()]
}))

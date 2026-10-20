import * as Option from "effect/Option"
import { LoadWorkspaces } from "./command.ts"
import { WorkspacesComposition } from "./composition.ts"
import { Workspaces } from "./definition.ts"

/** The listing as it starts, under way, with nothing being done in the dialog and the dialog closed. */
export const init = WorkspacesComposition.makeInit(() => ({
  model: { workspaces: Workspaces.Loading(), entering: Option.none() },
  commands: [LoadWorkspaces()]
}))

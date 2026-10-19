import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { SearchComposition } from "./composition.ts"
import { Results } from "./definition.ts"

/** The search before anything is typed in it, with its dialog closed. */
export const init = SearchComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: { workspaceId, memberId, query: "", results: Results.Idle(), activeIndex: 0 }
}))

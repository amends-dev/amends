import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { SearchComposition } from "./composition.ts"
import { SearchStatus } from "./definition.ts"

/** The search before anything is typed in it, with nothing read yet and its dialog closed. */
export const init = SearchComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: { workspaceId, memberId, query: "", status: SearchStatus.Reading(), activeIndex: 0 }
}))

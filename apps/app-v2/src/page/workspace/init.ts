import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { WorkspaceComposition } from "./composition.ts"
import { Open } from "./definition.ts"

/** The workspace `workspaceId`, called `name`, as the member `memberId`, with nothing open. */
export const init = WorkspaceComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, name: string) => ({
    childInitContext: { workspaceId, memberId },
    model: { workspaceId, memberId, name, open: Open.Nothing() }
  })
)

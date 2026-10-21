import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { ProfileCardComposition } from "./composition.ts"
import { Card } from "./definition.ts"

/** No card open, for the person `memberId` in the workspace `workspaceId`. */
export const init = ProfileCardComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: { workspaceId, memberId, card: Card.Closed() }
  })
)

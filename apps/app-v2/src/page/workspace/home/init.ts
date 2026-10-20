import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import type { Viewport } from "@amends-dev/design/viewport"
import { HomeComposition } from "./composition.ts"
import { Open } from "./definition.ts"

/**
 * Home of the workspace `workspaceId`, as the member `memberId`, in a window of the width `viewport`, showing the
 * inbox, which with its tasks and groups is not read yet.
 */
export const init = HomeComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, viewport: Viewport) => ({
    childInitContext: { workspaceId, memberId },
    model: { workspaceId, memberId, viewport, open: Open.Inbox() }
  })
)

import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import type { Viewport } from "@amends-dev/design/viewport"
import { LoadIntegrations } from "./command.ts"
import { WorkspaceComposition } from "./composition.ts"
import { Open } from "./definition.ts"

/**
 * The workspace `workspaceId`, called `name`, as the member `memberId`, in a window of the width `viewport`,
 * showing Home, listing the integrations.
 */
export const init = WorkspaceComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, name: string, viewport: Viewport) => ({
    childInitContext: { workspaceId, memberId, viewport },
    model: { workspaceId, memberId, name, open: Open.Home(), viewport },
    commands: [LoadIntegrations({ workspaceId })]
  })
)

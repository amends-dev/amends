import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { WorkspaceComposition } from "./composition.ts"

/** The workspace `workspaceId`, called `name`, as the member `memberId`, with no group open. */
export const init = WorkspaceComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, name: string) => ({
    childInitContext: { workspaceId, memberId },
    model: { workspaceId, memberId, name, group: Option.none() }
  })
)

import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { Integrations } from "../../data/connections.ts"
import { ConnectionsComposition } from "./composition.ts"

/**
 * The connections before they are read, and before the page has listed the integrations the host installs, nothing
 * being added, replaced, or removed, the dialog closed.
 */
export const init = ConnectionsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: {
      workspaceId,
      memberId,
      connections: [],
      isLoaded: false,
      members: [],
      integrations: Integrations.cases.Loading.make({}),
      grants: [],
      browse: { tab: "all" as const, query: "" },
      adding: Option.none(),
      replacing: Option.none(),
      removing: Option.none(),
      edits: [],
      checks: [],
      reads: 0,
      notice: Option.none()
    }
  })
)

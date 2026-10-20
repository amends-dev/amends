import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { ConnectionsComposition } from "./composition.ts"
import { Integrations, Model } from "./definition.ts"

/** The connections before they are read, and before the page has listed the integrations the host installs. */
export const init = ConnectionsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: Model.make({
      workspaceId,
      memberId,
      connections: [],
      isLoaded: false,
      members: [],
      integrations: Integrations.Loading(),
      grants: [],
      browse: { tab: "all", query: "" },
      edits: [],
      checks: [],
      notice: Option.none()
    })
  })
)

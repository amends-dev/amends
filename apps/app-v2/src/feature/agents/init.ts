import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { Integrations } from "../connections/definition.ts"
import { AgentsComposition } from "./composition.ts"

/**
 * The agents before they are read, and before the page has listed the integrations the host installs, nothing being
 * added or removed, the dialog closed.
 */
export const init = AgentsComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: {
    workspaceId,
    memberId,
    isLoaded: false,
    agents: [],
    members: [],
    connections: [],
    integrations: Integrations.Loading(),
    roles: [],
    workspace: Option.none(),
    grants: [],
    turns: [],
    groups: [],
    browse: { tab: "All" as const, query: "" },
    adding: Option.none(),
    removing: Option.none(),
    edits: [],
    offered: [],
    reads: 0,
    notice: Option.none()
  }
}))

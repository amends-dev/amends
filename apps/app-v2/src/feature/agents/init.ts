import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { Integrations } from "../connections/definition.ts"
import { AgentsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The agents before they are read, and before the page has listed the integrations the host installs. */
export const init = AgentsComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: Model.make({
    workspaceId,
    memberId,
    agents: [],
    members: [],
    connections: [],
    integrations: Integrations.Loading(),
    roles: [],
    workspace: Option.none(),
    grants: [],
    form: Option.none(),
    offered: Option.none(),
    notice: Option.none()
  })
}))

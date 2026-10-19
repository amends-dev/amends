import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { Integrations } from "../connections/definition.ts"
import { LoadIntegrations } from "./command.ts"
import { AgentsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The agents before they are read, asking the host for the integrations it installs. */
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
  }),
  commands: [LoadIntegrations({ workspaceId })]
}))

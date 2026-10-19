import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { LoadIntegrations } from "./command.ts"
import { ConnectionsComposition } from "./composition.ts"
import { Integrations, Model } from "./definition.ts"

/** The connections before they are read, asking the host for the integrations it installs. */
export const init = ConnectionsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: Model.make({
      workspaceId,
      memberId,
      connections: [],
      integrations: Integrations.Loading(),
      grants: [],
      form: Option.none(),
      checks: [],
      notice: Option.none()
    }),
    commands: [LoadIntegrations({ workspaceId })]
  })
)

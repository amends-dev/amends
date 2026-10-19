import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { Integrations } from "../connections/definition.ts"
import { ChannelsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The channels before they are read, and before the page has listed the integrations the host installs. */
export const init = ChannelsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: Model.make({
      workspaceId,
      memberId,
      channels: [],
      connections: [],
      integrations: Integrations.Loading(),
      groups: [],
      memberships: [],
      members: [],
      grants: [],
      form: Option.none(),
      notice: Option.none()
    })
  })
)

import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { ActionsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

export const init = ActionsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: Model.make({ workspaceId, memberId, actions: [], notice: Option.none() })
  })
)

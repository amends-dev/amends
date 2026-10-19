import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { GroupsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

export const init = GroupsComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: Model.make({ workspaceId, memberId, groups: [], members: [], selected: Option.none(), notice: Option.none() })
}))

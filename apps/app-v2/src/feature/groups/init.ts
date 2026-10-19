import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { GroupsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The groups before they are read, none picked, nothing being started. */
export const init = GroupsComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: Model.make({
    workspaceId,
    memberId,
    groups: [],
    members: [],
    memberships: [],
    grants: [],
    selected: Option.none(),
    starting: Option.none(),
    notice: Option.none()
  })
}))

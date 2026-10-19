import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { GroupsComposition } from "./composition.ts"

/** The groups before they are read, none picked, nothing being started, the dialog closed. */
export const init = GroupsComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: {
    workspaceId,
    memberId,
    groups: [],
    members: [],
    memberships: [],
    grants: [],
    selected: Option.none(),
    starting: Option.none(),
    notice: Option.none()
  }
}))

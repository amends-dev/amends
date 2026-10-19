import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { GroupsComposition } from "./composition.ts"

/** The groups before they are read, none picked, the browse page on the groups they belong to, searching nothing, nothing being started, the dialog closed. */
export const init = GroupsComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: {
    workspaceId,
    memberId,
    groups: [],
    members: [],
    memberships: [],
    grants: [],
    selected: Option.none(),
    browse: { tab: "Yours", query: "" },
    starting: Option.none(),
    notice: Option.none()
  }
}))

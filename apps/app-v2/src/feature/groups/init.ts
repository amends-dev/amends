import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { GroupsComposition } from "./composition.ts"

/**
 * The groups before they are read, none picked, the browse page on the groups they belong to, searching nothing,
 * none being joined, nothing being started, the dialog closed, and no asking to read them again.
 */
export const init = GroupsComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: {
    workspaceId,
    memberId,
    isLoaded: false,
    groups: [],
    members: [],
    memberships: [],
    grants: [],
    selected: Option.none(),
    browse: { tab: "Yours", query: "" },
    joining: [],
    starting: Option.none(),
    reads: 0,
    notice: Option.none()
  }
}))

import type { GroupId } from "@amends-dev/core/group"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { GroupComposition } from "./composition.ts"

/** The group `groupId` as it opens, before it is read, its threads listed and none open. */
export const init = GroupComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, groupId: GroupId.GroupId) => ({
    childInitContext: { workspaceId, memberId, groupId },
    model: {
      workspaceId,
      memberId,
      groupId,
      group: Option.none(),
      memberships: [],
      follow: Option.none(),
      members: [],
      grants: [],
      present: [],
      renaming: Option.none(),
      admitting: Option.none(),
      thread: Option.none(),
      notice: Option.none()
    }
  })
)

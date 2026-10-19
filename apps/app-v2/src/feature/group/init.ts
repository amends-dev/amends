import type { GroupId } from "@amends-dev/core/group"
import type { ThreadId } from "@amends-dev/core/thread"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { GroupComposition, openThread } from "./composition.ts"

/**
 * The group `groupId` as it opens, before it is read, its threads listed, and the thread `threadId`
 * open in it, if there is one.
 */
export const init = GroupComposition.makeInit(
  (
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    groupId: GroupId.GroupId,
    threadId: Option.Option<ThreadId.ThreadId>
  ) => ({
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
    },
    steps: Option.toArray(Option.map(threadId, openThread))
  })
)

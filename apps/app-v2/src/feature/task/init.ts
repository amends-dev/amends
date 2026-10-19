import type { ThreadId } from "@amends-dev/core/thread"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { TaskComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The task of `threadId`, before the thread is read. */
export const init = TaskComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId) => ({
    model: Model.make({
      workspaceId,
      memberId,
      threadId,
      groupId: Option.none(),
      task: Option.none(),
      members: [],
      grants: [],
      notice: Option.none()
    })
  })
)

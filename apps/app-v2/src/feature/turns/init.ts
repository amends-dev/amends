import type { ThreadId } from "@amends-dev/core/thread"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { TurnsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The turns of `threadId`, before the thread is read. */
export const init = TurnsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId) => ({
    model: Model.make({
      workspaceId,
      memberId,
      threadId,
      turns: [],
      members: [],
      grants: [],
      log: Option.none(),
      notice: Option.none()
    })
  })
)

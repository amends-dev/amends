import type { ThreadId } from "@amends-dev/core/thread"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { ThreadComposition } from "./composition.ts"

/** The thread `threadId` as it opens, before it is read, with a composer to reply in it. */
export const init = ThreadComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId) => ({
    childInitContext: { workspaceId, memberId, threadId },
    model: {
      workspaceId,
      memberId,
      threadId,
      title: Option.none(),
      messages: [],
      following: Option.none(),
      changes: [],
      latest: 0,
      readThrough: 0,
      readRequested: 0,
      renaming: Option.none(),
      editing: Option.none(),
      typingTold: false,
      members: [],
      contacts: [],
      present: [],
      notice: Option.none()
    }
  })
)

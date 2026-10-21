import type { GroupId } from "@amends-dev/core/group"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { AssigneeFilter } from "../../taskFilter.ts"
import { ThreadsComposition } from "./composition.ts"

/** The threads of `groupId`, before they are read, on the Threads tab, with a composer to start one. */
export const init = ThreadsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, groupId: GroupId.GroupId) => ({
    childInitContext: { workspaceId, memberId, groupId },
    model: {
      workspaceId,
      memberId,
      groupId,
      threads: [],
      isLoaded: false,
      tab: "Threads",
      taskFilter: { status: "All", assignee: AssigneeFilter.Anyone(), query: "" },
      taskSort: "Latest",
      reads: 0,
      notice: Option.none()
    }
  })
)

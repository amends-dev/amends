import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { AssigneeFilter } from "../../taskFilter.ts"
import { TasksComposition } from "./composition.ts"

/** The tasks before they are read, narrowed to nothing. */
export const init = TasksComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: {
    workspaceId,
    memberId,
    items: [],
    members: [],
    filter: { status: "All" as const, assignee: AssigneeFilter.Anyone(), query: "" },
    notice: Option.none()
  }
}))

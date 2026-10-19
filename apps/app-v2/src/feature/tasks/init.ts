import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { TasksComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The tasks before they are read, narrowed to nothing. */
export const init = TasksComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: Model.make({
    workspaceId,
    memberId,
    items: [],
    members: [],
    contacts: [],
    filter: { status: "All", assignee: "Anyone", query: "" },
    notice: Option.none()
  })
}))

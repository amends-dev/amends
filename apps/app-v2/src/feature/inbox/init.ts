import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { InboxComposition } from "./composition.ts"
import { Model, pageSize } from "./definition.ts"

/** The inbox before it is read, on the notifications that wait, with no thread open, showing the first page of them. */
export const init = InboxComposition.makeInit((workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
  model: Model.make({
    workspaceId,
    memberId,
    tab: "Unread",
    shown: pageSize,
    isLoaded: false,
    items: [],
    selected: Option.none(),
    groups: [],
    members: [],
    contacts: [],
    reads: 0,
    isMarkingAllSeen: false,
    notice: Option.none()
  })
}))

import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { SettingsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The settings before they are read, no name being changed, the roster of the members who are in the workspace, no member open. */
export const init = SettingsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: Model.make({
      workspaceId,
      memberId,
      workspace: Option.none(),
      members: [],
      roles: [],
      assignments: [],
      grants: [],
      isUnreadable: false,
      reads: 0,
      workspaceName: Option.none(),
      ownName: Option.none(),
      filter: { query: "", status: "active" },
      selected: Option.none(),
      copyAttempts: 0,
      copiedAttempt: Option.none()
    })
  })
)

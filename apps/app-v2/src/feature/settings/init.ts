import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { SettingsComposition } from "./composition.ts"

/**
 * The settings before they are read, no name being changed, the roster of the members who are in the workspace, no
 * member open, the dialog closed.
 */
export const init = SettingsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: {
      workspaceId,
      memberId,
      workspace: Option.none(),
      members: [],
      roles: [],
      assignments: [],
      invitations: [],
      grants: [],
      isUnreadable: false,
      reads: 0,
      workspaceName: Option.none(),
      filter: { query: "", status: "active" as const },
      selected: Option.none(),
      entering: Option.none(),
      copyAttempts: 0,
      copiedAttempt: Option.none()
    }
  })
)

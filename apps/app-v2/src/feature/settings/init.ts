import { BuiltinRoles } from "@amends-dev/core/authorization"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { SettingsComposition } from "./composition.ts"
import { Model } from "./definition.ts"

/** The settings before they are read, no name being given, inviting as a member. */
export const init = SettingsComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) => ({
    model: Model.make({
      workspaceId,
      memberId,
      workspace: Option.none(),
      members: [],
      roles: [],
      assignments: [],
      invitations: [],
      grants: [],
      renaming: Option.none(),
      inviting: { email: "", roleId: BuiltinRoles.MemberId },
      notice: Option.none()
    })
  })
)

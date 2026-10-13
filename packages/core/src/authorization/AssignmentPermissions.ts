/**
 * The actions on assignments that need a grant: reading a member's, and managing them across the
 * workspace. `AssignmentService` checks them, as do `WorkspaceSettingsService` and the change feed
 * for what they show of access, and `Delegation` requires `Manage` of whoever gives a role.
 *
 * @since 0.1.0
 */

import * as Permission from "./Permission.ts"

const assignment = Permission.makeGroup("assignment", { targetKind: "Member" })

/**
 * Read a member's assignments and the roles on offer, and see the assignment events that concern
 * them.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Read = assignment.make("read", { builtinTier: "member" })

/**
 * Give, change, and revoke roles across the workspace, under the delegation rules; inviting with a
 * role and creating an agent with one need it too.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Manage = assignment.make("manage", {
  targetKind: "Workspace",
  builtinTier: "administrator"
})

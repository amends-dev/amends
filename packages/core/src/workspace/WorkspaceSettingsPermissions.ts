/**
 * The action on a workspace's settings that needs a grant: renaming it. Reading settings needs
 * active membership alone; what they show beyond the name is governed by `InvitationPermissions`,
 * `AssignmentPermissions`, and `MemberPermissions`.
 *
 * @since 0.1.0
 */
import * as Permission from "../authorization/Permission.ts";

/**
 * Rename the workspace. Only the Owner role holds it.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Rename = Permission.make("workspace.rename", {
  targetKind: "Workspace",
  builtinTier: "owner",
});

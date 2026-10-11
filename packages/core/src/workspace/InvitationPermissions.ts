/**
 * The action on invitations that needs a grant: managing them, which issuing, revoking, and
 * listing all need. Whether the issuer may delegate an invitation's role is a separate check,
 * `Delegation.requireGrant`, under `AssignmentPermissions.Manage`.
 *
 * @since 0.1.0
 */
import * as Permission from "../authorization/Permission.ts";

/**
 * Issue, revoke, and list invitations; the authority to delegate their role is checked separately.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Manage = Permission.make("invitation.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

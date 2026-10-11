/**
 * The action on ownership that needs a grant: transferring it. The Owner role holds the grant, and
 * only the current owner may use it; reading ownership needs active membership alone.
 *
 * @since 0.1.0
 */
import * as Permission from "../authorization/Permission.ts";

/**
 * Transfer ownership of the workspace to another active human member.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Transfer = Permission.make("workspace.transfer-ownership", {
  targetKind: "Workspace",
  builtinTier: "owner",
});

import * as Permission from "../../authorization/permission.ts";

/** Issuing and revoking invitations; authority to delegate their role is checked separately. */
export const Manage = Permission.make("invitation.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

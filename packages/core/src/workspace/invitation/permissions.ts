import { Permission } from "../../authorization/permission.ts";

/** Issuing and revoking invitations; authority to select their grants is checked separately. */
export const Manage = Permission.make("invitation.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

export * as InvitationPermissions from "./permissions.ts";

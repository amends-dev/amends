import { Permission } from "../authorization/permission.ts";

/** Issuing and revoking invitations; authority to select their grants is checked separately. */
export const Manage = Permission.make("invitation.manage", { targetKind: "Workspace" });

export * as InvitationPermissions from "./invitation-permissions.ts";

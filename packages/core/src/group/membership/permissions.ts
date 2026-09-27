import { Permission } from "../../authorization/permission.ts";

/** Default bundle placement does not restrict which roles or direct grants can supply this. */
export const Manage = Permission.make("group.membership.manage", {
  targetKind: "Group",
  builtinTier: "administrator",
});

/** Joining a public team group as oneself; private and direct groups cannot be joined. */
export const Join = Permission.make("group.join", {
  targetKind: "Group",
  builtinTier: "viewer",
});

export * as GroupMembershipPermissions from "./permissions.ts";

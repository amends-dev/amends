import { Permission } from "../../authorization/permission.ts";

/** Default bundle placement does not restrict which roles or direct grants can supply this. */
export const Manage = Permission.make("group.membership.manage", {
  targetKind: "Group",
  builtinTier: "administrator",
});

export * as GroupMembershipPermissions from "./permissions.ts";

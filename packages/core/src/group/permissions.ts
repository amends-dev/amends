import { Permission } from "../authorization/permission.ts";

/** Bundle placement is a default; any role or direct grant can supply this permission. */
export const Create = Permission.make("group.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/** Ordinary group reads also require current audience membership. */
export const Read = Permission.make("group.read", {
  targetKind: "Group",
  builtinTier: "viewer",
});

/** Renaming a team group, which its members see as its name. */
export const Rename = Permission.make("group.rename", {
  targetKind: "Group",
  builtinTier: "administrator",
});

/** Following a team group for oneself; making an agent follow needs agent use instead. */
export const Follow = Permission.make("group.follow", {
  targetKind: "Group",
  builtinTier: "viewer",
});

export * as GroupPermissions from "./permissions.ts";

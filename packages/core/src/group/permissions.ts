import { Permission } from "../authorization/permission.ts";

/** Bundle placement is a default; any role or direct grant can supply this permission. */
export const Create = Permission.make("group.create", {
  targetKind: "Workspace",
  builtinTier: "member",
});

/** Ordinary group reads also require current audience membership. */
export const Read = Permission.make("group.read", {
  targetKind: "Group",
  builtinTier: "member",
});

/** Renaming a team group, which its members see as its name; only its members may. */
export const Rename = Permission.make("group.rename", {
  targetKind: "Group",
  builtinTier: "member",
});

/** Following a team group for oneself; making an agent follow needs agent use instead. */
export const Follow = Permission.make("group.follow", {
  targetKind: "Group",
  builtinTier: "member",
});

/**
 * Removing people from a public team group, as a member of it; in a private group any member may.
 * Workspace roles give no authority over private or direct groups, so this covers public ones only.
 */
export const Moderate = Permission.make("group.moderate", {
  targetKind: "Group",
  builtinTier: "administrator",
});

export * as GroupPermissions from "./permissions.ts";

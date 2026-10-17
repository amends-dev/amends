/**
 * The actions on a group that need a grant: creating one in the workspace, and reading, renaming,
 * following, and moderating one. Managing and joining membership are declared beside their
 * operations, in `GroupMembershipPermissions`. Every action on an existing group also needs
 * current membership of it: no grant reaches a group from outside.
 *
 * @since 0.1.0
 */

import * as Permission from "../authorization/Permission.ts"

/**
 * Create a team group in the workspace. Its bundle placement is a default; any role or direct
 * grant can supply this permission.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Create = Permission.make("group.create", {
  targetKind: "Workspace",
  builtinTier: "member"
})

/**
 * Read a group: its record, its row in the reader's list, and its roster. Ordinary group reads
 * also require current audience membership.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Read = Permission.make("group.read", {
  targetKind: "Group",
  builtinTier: "member"
})

/**
 * Renaming a team group, which its members see as its name; only its members may.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Rename = Permission.make("group.rename", {
  targetKind: "Group",
  builtinTier: "member"
})

/**
 * Following a team group for oneself; making an agent follow needs agent use instead.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Follow = Permission.make("group.follow", {
  targetKind: "Group",
  builtinTier: "member"
})

/**
 * Removing people from a public team group, as a member of it; in a private group any member may.
 * Workspace roles give no authority over private or direct groups, so this covers public ones only.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Moderate = Permission.make("group.moderate", {
  targetKind: "Group",
  builtinTier: "administrator"
})

/**
 * The actions on a group's membership that need a grant: adding people to a team group and
 * removing them, and joining a public one. The actions on the group itself are in
 * `GroupPermissions`. Leaving needs no grant beyond active workspace membership.
 *
 * @since 0.1.0
 */
import * as Permission from "../authorization/Permission.ts";

/**
 * Adding people to a team group the actor belongs to, and removing them from a private one.
 * Being in the group is required too: no grant reaches a group from outside it.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Manage = Permission.make("group.membership.manage", {
  targetKind: "Group",
  builtinTier: "member",
});

/**
 * Joining a public team group as oneself; private and direct groups cannot be joined.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Join = Permission.make("group.join", {
  targetKind: "Group",
  builtinTier: "member",
});

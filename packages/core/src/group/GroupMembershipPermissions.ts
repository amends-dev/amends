import * as Permission from "../authorization/Permission.ts";

/**
 * Adding people to a team group the actor belongs to, and removing them from a private one.
 * Being in the group is required too: no grant reaches a group from outside it.
 */
export const Manage = Permission.make("group.membership.manage", {
  targetKind: "Group",
  builtinTier: "member",
});

/** Joining a public team group as oneself; private and direct groups cannot be joined. */
export const Join = Permission.make("group.join", {
  targetKind: "Group",
  builtinTier: "member",
});

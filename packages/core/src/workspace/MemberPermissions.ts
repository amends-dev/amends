/**
 * The actions on a member that need a grant: reading one and removing one. Renaming oneself needs
 * active membership alone; assigning roles is `AssignmentPermissions`, and transferring ownership
 * `OwnershipPermissions`.
 *
 * @since 0.1.0
 */
import * as Permission from "../authorization/Permission.ts";

const member = Permission.makeGroup("member", { targetKind: "Member" });

/**
 * Read a membership, active or removed. A grant on the workspace reads everyone; a grant on one
 * member reads that member, and lists skip the rest.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Read = member.make("read", { builtinTier: "member" });

/**
 * Remove a member: end their access, their group admissions, and their pending invitations. The
 * delegation rules decide whom an administrator may remove, and the owner cannot be removed.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Remove = member.make("remove", { builtinTier: "administrator" });

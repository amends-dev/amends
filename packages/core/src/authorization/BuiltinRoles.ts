/**
 * The three built-in roles, Member, Administrator, and Owner, and the bundles `make` builds for
 * them from the registered declarations: each role holds every permission whose `builtinTier` is
 * its own or lower, so the bundles are cumulative. Tiers only build bundles; authorization checks
 * the permissions a role records. Workspace initialization records the bundles with their
 * `revision`, and `BuiltinRoleUpgrade` brings a workspace at an earlier revision to the host's.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import type * as Workspace from "../workspace/Workspace.ts";
import * as Permission from "./Permission.ts";
import * as Role from "./Role.ts";

/**
 * The Member role, which every member is given on joining. Reserved identities are scoped by the
 * role's workspace, and display names are not identities.
 *
 * @category constructors
 * @since 0.1.0
 */
export const MemberId = Role.Id.make("builtin:member");

/**
 * The Administrator role, which only the owner gives, and which a former owner takes on transfer.
 *
 * @category constructors
 * @since 0.1.0
 */
export const AdministratorId = Role.Id.make("builtin:administrator");

/**
 * The Owner role, held by the workspace's owner alone and given only at initialization and by
 * ownership transfer.
 *
 * @category constructors
 * @since 0.1.0
 */
export const OwnerId = Role.Id.make("builtin:owner");

const roles = [
  { id: MemberId, name: "Member", tier: "member" },
  { id: AdministratorId, name: "Administrator", tier: "administrator" },
  { id: OwnerId, name: "Owner", tier: "owner" },
] as const;

/**
 * Which version of the built-in bundles a workspace's roles hold: a positive integer.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Revision = Schema.Int.check(Schema.isGreaterThan(0));

/**
 * The revision of the bundles `make` constructs from the registered declarations. Raise it with
 * any change to them: a permission added or removed, a declaration's tier, or a role's name. A
 * workspace recorded at an older revision is upgraded when a host loads it, and one at a newer
 * revision is left alone, so an older host never reverts it. A test pins each revision's bundles.
 *
 * @category utils
 * @since 0.1.0
 */
export const revision = 1;

/**
 * Display label for a built-in identity, including invitations before membership exists; any
 * other role ID is its own label.
 *
 * @category utils
 * @since 0.1.0
 */
export const nameOf = (roleId: Role.Id): string =>
  roles.find(({ id }) => id === roleId)?.name ?? roleId;

// Ordering is local to bundle construction. Access checks use stored permissions and scopes.
const order: Readonly<Record<Permission.BuiltinTier, number>> = {
  member: 0,
  administrator: 1,
  owner: 2,
};
const declarations = Schema.Array(Permission.Definition);

/**
 * Construct cumulative built-in role records from the registered permission declarations.
 * Persist these through role facts: authorization and replay never regenerate them, and a
 * workspace takes a new revision's bundles through recorded facts too.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: Workspace.Id,
  permissions: ReadonlyArray<Permission.Definition>,
): ReadonlyArray<Role.Role> => {
  const checked = declarations.make(permissions);
  return roles.map(({ id, name, tier }) =>
    Role.Role.make({
      id,
      workspaceId,
      name,
      permissions: checked
        .filter((permission) => order[permission.builtinTier] <= order[tier])
        .map((permission) => permission.name),
    }),
  );
};

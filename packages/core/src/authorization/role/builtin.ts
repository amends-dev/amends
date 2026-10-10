import { Schema } from "effect";
import type { Workspace } from "../../workspace/workspace.ts";
import { Permission } from "../permission.ts";
import { Role } from "./role.ts";

/** Reserved identities, scoped by the role's workspace. Display names are not identities. */
export const MemberId = Role.Id.make("builtin:member");
export const AdministratorId = Role.Id.make("builtin:administrator");
export const OwnerId = Role.Id.make("builtin:owner");

const roles = [
  { id: MemberId, name: "Member", tier: "member" },
  { id: AdministratorId, name: "Administrator", tier: "administrator" },
  { id: OwnerId, name: "Owner", tier: "owner" },
] as const;

/** Which version of the built-in bundles a workspace's roles hold. */
export const Revision = Schema.Int.check(Schema.isGreaterThan(0));

/**
 * The revision of the bundles `make` constructs from the registered declarations. Raise it with
 * any change to them: a permission added or removed, a declaration's tier, or a role's name. A
 * workspace recorded at an older revision is upgraded when a host loads it, and one at a newer
 * revision is left alone, so an older host never reverts it. A test pins each revision's bundles.
 */
export const revision = 9;

/** Display label for a built-in identity, including invitations before membership exists. */
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
 */
export const make = (
  workspaceId: Workspace.Id,
  permissions: ReadonlyArray<Permission.Definition>,
): ReadonlyArray<Role.Record> => {
  const checked = declarations.make(permissions);
  return roles.map(({ id, name, tier }) =>
    Role.Record.make({
      id,
      workspaceId,
      name,
      permissions: checked
        .filter((permission) => order[permission.builtinTier] <= order[tier])
        .map((permission) => permission.name),
    }),
  );
};

export * as BuiltinRoles from "./builtin.ts";

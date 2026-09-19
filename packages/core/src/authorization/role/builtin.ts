import { Schema } from "effect";
import type { Workspace } from "../../workspace/workspace.ts";
import { Permission } from "../permission.ts";
import { Role } from "./role.ts";

/** Reserved identities, scoped by the role's workspace. Display names are not identities. */
export const ViewerId = Role.Id.make("builtin:viewer");
export const AdministratorId = Role.Id.make("builtin:administrator");
export const OwnerId = Role.Id.make("builtin:owner");

const roles = [
  { id: ViewerId, name: "Viewer", tier: "viewer" },
  { id: AdministratorId, name: "Administrator", tier: "administrator" },
  { id: OwnerId, name: "Owner", tier: "owner" },
] as const;

// Ordering is local to bundle construction. Access checks use stored permissions and scopes.
const order: Readonly<Record<Permission.BuiltinTier, number>> = {
  viewer: 0,
  administrator: 1,
  owner: 2,
};
const declarations = Schema.Array(Permission.Definition);

/**
 * Construct cumulative built-in role records from the registered permission declarations.
 * Persist these through role facts: authorization and replay never regenerate them.
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

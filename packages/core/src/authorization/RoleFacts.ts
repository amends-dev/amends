/**
 * The facts recorded about roles: created, renamed, given new permissions, and the built-in
 * bundles' revision. Workspace initialization records the built-in roles and their revision, and
 * `BuiltinRoleUpgrade` records whatever brings them to a later one; `RoleProjection` keeps
 * `RoleStore` from them. All reach the whole workspace.
 *
 * @since 0.1.0
 */
import * as Subject from "../journal/Subject.ts";
import { Schema } from "effect";
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Workspace from "../workspace/Workspace.ts";
import * as BuiltinRoles from "./BuiltinRoles.ts";
import * as Role from "./Role.ts";

/**
 * Establishes a workspace role with its initial permission names.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("workspace.role.created", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("role", payload.roleId),
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    name: Role.Role.fields.name,
    permissions: Role.Role.fields.permissions,
  }),
  occurrence: (payload) => [payload.roleId],
});

/**
 * Changes the display name while retaining the role's identity.
 *
 * @category facts
 * @since 0.1.0
 */
export const Renamed = Fact.make("workspace.role.renamed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("role", payload.roleId),
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    name: Role.Role.fields.name,
  }),
});

/**
 * Replaces the complete permission list; an empty list removes all permissions.
 *
 * @category facts
 * @since 0.1.0
 */
export const PermissionsChanged = Fact.make("workspace.role.permissions-changed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("role", payload.roleId),
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    permissions: Role.Role.fields.permissions,
  }),
});

/**
 * The workspace's built-in roles now hold this revision's bundles. Recorded at initialization
 * and after each upgrade, following the role facts that brought them there.
 *
 * @category facts
 * @since 0.1.0
 */
export const BuiltinsRevised = Fact.make("workspace.role.builtins-revised", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("builtin-roles", payload.workspaceId),
  version: 1,
  payload: Schema.Struct({ workspaceId: Workspace.Id, revision: BuiltinRoles.Revision }),
  occurrence: (payload) => [String(payload.revision)],
});

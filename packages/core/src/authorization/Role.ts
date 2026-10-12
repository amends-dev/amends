/**
 * A role: a named bundle of permissions recorded in one workspace, which a role assignment gives a
 * member at a scope. The only roles are the built-in Member, Administrator, and Owner that
 * `BuiltinRoles` builds; `RoleFacts` record them, `RoleProjection` keeps them in `RoleStore`, and
 * `GrantResolver` reads a role's current permissions each time it resolves an assignment of it.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Workspace from "../workspace/Workspace.ts";
import * as Permission from "./Permission.ts";

/**
 * Stable identity retained when the role's display name or permissions change.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceRoleId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;

/**
 * A workspace-owned permission bundle. Assignments supply recipients and scopes. Permission
 * definitions and existing assignments must be checked when editing a role.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Role = Schema.Struct({
  id: Id,
  workspaceId: Workspace.Id,
  name: Schema.NonEmptyString,
  /** Empty roles confer no permissions; each permission name appears at most once. */
  permissions: Schema.UniqueArray(Permission.Name),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Role extends Schema.Schema.Type<typeof Role> {}

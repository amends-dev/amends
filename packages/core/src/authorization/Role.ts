/**
 * A role: a named bundle of permissions recorded in one workspace, which a role assignment gives a
 * member at a scope. The only roles are the built-in Member, Administrator, and Owner that
 * `BuiltinRoles` builds; `RoleFacts` record them, `RoleProjection` keeps them in `RoleStore`, and
 * `GrantResolver` reads a role's current permissions each time it resolves an assignment of it.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Permission from "./Permission.ts"

/**
 * Stable identity retained when the role's display name or permissions change.
 *
 * @category schemas
 * @since 0.1.0
 */
export const RoleId = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceRoleId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type RoleId = typeof RoleId.Type

/**
 * A workspace-owned permission bundle; its assignments supply recipients and scopes. No member
 * edits a role: only `BuiltinRoleUpgrade` renames one or replaces its permissions, bringing a
 * built-in role to the host's revision.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Role = Schema.Struct({
  id: RoleId,
  workspaceId: WorkspaceId.WorkspaceId,
  name: Schema.NonEmptyString,
  /** Empty roles confer no permissions; each permission name appears at most once. */
  permissions: Schema.UniqueArray(Permission.Name)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Role extends Schema.Schema.Type<typeof Role> {}

/** Shared workspace ownership and role choices. */

import { BuiltinRoles, type Role } from "@amends-dev/core/authorization"
import { Workspace, type MemberId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/** The workspace, and whether a change to it is on its way. */
export const WorkspaceItem = Schema.Struct({ workspace: Workspace.Workspace, pending: Schema.Boolean })
export type WorkspaceItem = typeof WorkspaceItem.Type

/** The workspace, its roles, and the member choosing which role to give. */
export interface WorkspaceAccess {
  readonly workspace: Option.Option<WorkspaceItem>
  readonly memberId: MemberId.MemberId
  readonly roles: ReadonlyArray<Role.Role>
}

/** Whether the person is the workspace's owner. */
export const isOwner = (access: Pick<WorkspaceAccess, "workspace" | "memberId">): boolean =>
  Option.exists(access.workspace, ({ workspace }) => workspace.ownerMemberId === access.memberId)

/**
 * The roles the person may give: Member, and Administrator when they own the workspace; Owner only
 * passes by transfer. It reads the roles, the workspace, and the person a record keeps, so a Block
 * that keeps the same three fields asks it of its own.
 */
export const givableRoles = (
  access: Pick<WorkspaceAccess, "roles" | "workspace" | "memberId">
): ReadonlyArray<Role.Role> =>
  access.roles.filter(
    ({ id }) => id === BuiltinRoles.MemberId || (id === BuiltinRoles.AdministratorId && isOwner(access))
  )

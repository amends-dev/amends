/**
 * What the person may do in the open workspace, as core decides it from the records their replica
 * holds: the grants their own active assignments confer through the workspace's roles, and the
 * delegation rule for whose roles they may change. The server decides again when an action
 * reaches it; these keep the app from offering what it would refuse.
 */

import {
  Assignment,
  BuiltinRoles,
  Delegation,
  Grant,
  GrantResolver,
  type Permission,
  Requirement,
  type Role,
  type Target
} from "@amends-dev/core/authorization"
import type { Member } from "@amends-dev/core/workspace"
import type { Opened } from "./model.ts"

/** The active assignments of `memberId` the replica holds. */
const assignmentsOf = (opened: Opened, memberId: Member.Member["id"]) =>
  opened.assignments
    .filter(({ assignment }) => assignment.memberId === memberId && assignment.status === "active")
    .map(({ assignment }) => assignment)

/** Whether the person holds `permission` on `target`. */
export const may = <K extends Target.Kind>(
  opened: Opened,
  permission: Permission.Definition<K>,
  target: Target.Of<NoInfer<K>>
): boolean =>
  Grant.anyCovers(
    GrantResolver.grantsOf(assignmentsOf(opened, opened.memberId), (roleId) =>
      opened.roles.find((role) => role.id === roleId)
    ),
    Requirement.make(permission, target)
  )

/** Whether the person is the workspace's owner. */
export const isOwner = (opened: Opened): boolean => opened.workspace.ownerMemberId === opened.memberId

/** Whether the delegation rule lets the person change `memberId`'s roles or remove them. */
export const mayActOn = (opened: Opened, memberId: Member.Member["id"]): boolean =>
  Delegation.recipientDenial(
    {
      workspaceId: opened.workspace.id,
      memberId,
      ownerId: opened.workspace.ownerMemberId,
      actorId: opened.memberId,
      selfRemoval: false
    },
    assignmentsOf(opened, memberId)
  ) === undefined

/** The roles the person may give: Member, and Administrator when they own the workspace; Owner only passes by transfer. */
export const givableRoles = (opened: Opened): ReadonlyArray<Role.Role> =>
  opened.roles.filter(
    ({ id }) => id === BuiltinRoles.MemberId || (id === BuiltinRoles.AdministratorId && isOwner(opened))
  )

/** The workspace-wide role assignments of `memberId`, as replacing their roles expects them. */
export const workspaceRolesOf = (opened: Opened, memberId: Member.Member["id"]) =>
  assignmentsOf(opened, memberId).filter(Assignment.isWorkspaceRole)

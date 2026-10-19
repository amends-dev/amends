/**
 * What the person may do in a workspace, as core decides it from the grants their store resolves.
 * The server decides again when an action reaches it; these keep a Block from offering what it
 * would refuse.
 */

import { Grant, type Permission, Requirement, Target } from "@amends-dev/core/authorization"
import type { GroupId } from "@amends-dev/core/group"
import type { WorkspaceId } from "@amends-dev/core/workspace"

/** Whether `grants` hold `permission` on `target`. */
export const may = <K extends Target.Kind>(
  grants: ReadonlyArray<Grant.Grant>,
  permission: Permission.Definition<K>,
  target: Target.Of<NoInfer<K>>
): boolean => Grant.anyCovers(grants, Requirement.make(permission, target))

/** The workspace as a target of the permissions that act on it. */
export const workspaceTarget = (workspaceId: WorkspaceId.WorkspaceId) =>
  Target.Reference.cases.Workspace.make({ workspaceId })

/** The group `groupId` as a target of the permissions that act on it. */
export const groupTarget = (workspaceId: WorkspaceId.WorkspaceId, groupId: GroupId.GroupId) =>
  Target.Reference.cases.Group.make({ workspaceId, groupId })

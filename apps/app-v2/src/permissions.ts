/**
 * What the person may do in a workspace, as core decides it from the grants their store resolves.
 * The server decides again when an action reaches it; these keep a Block from offering what it
 * would refuse.
 */

import type { Connection } from "@amends-dev/connection"
import { Grant, type Permission, Requirement, Target } from "@amends-dev/core/authorization"
import type { GroupId } from "@amends-dev/core/group"
import type { ThreadId } from "@amends-dev/core/thread"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"

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

/** The thread `threadId` as a target of the permissions that act on it. */
export const threadTarget = (workspaceId: WorkspaceId.WorkspaceId, threadId: ThreadId.ThreadId) =>
  Target.Reference.cases.Thread.make({ workspaceId, threadId })

/** The member `memberId` as a target of the permissions that act on them. */
export const memberTarget = (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId) =>
  Target.Reference.cases.Member.make({ workspaceId, memberId })

/** The connection `connectionId` as a target of the permissions that act on it. */
export const connectionTarget = (workspaceId: WorkspaceId.WorkspaceId, connectionId: Connection.ConnectionId) =>
  Target.Reference.cases.Connection.make({ workspaceId, connectionId })

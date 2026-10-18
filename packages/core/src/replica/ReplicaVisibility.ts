/**
 * Who may see each record a replica holds: a pure decision over the viewer's access, the grants
 * they hold and the groups they belong to, as core's operations authorize reading the same
 * records. The workspace, its roles, and its contacts are every member's; members, assignments,
 * invitations, channels, connections, and agents are seen under their read permission, and a
 * member's own record and assignments always by them; a group and its members by its members
 * under `group.read`, and a public team's by whoever may join it; a thread and everything in it by
 * its group's members under `thread.read` on it; and read state, follows, and notifications by
 * their member alone.
 *
 * @since 0.1.0
 */

import * as Match from "effect/Match"
import * as AgentPermissions from "../agent/AgentPermissions.ts"
import * as AssignmentPermissions from "../authorization/AssignmentPermissions.ts"
import * as Grant from "../authorization/Grant.ts"
import type * as Permission from "../authorization/Permission.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as ChannelPermissions from "../channel/ChannelPermissions.ts"
import * as ConnectionPermissions from "../connection/ConnectionPermissions.ts"
import type * as Group from "../group/Group.ts"
import type * as GroupId from "../group/GroupId.ts"
import * as GroupMembershipPermissions from "../group/GroupMembershipPermissions.ts"
import * as GroupPermissions from "../group/GroupPermissions.ts"
import * as Notification from "../notification/Notification.ts"
import type * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadPermissions from "../thread/ThreadPermissions.ts"
import * as InvitationPermissions from "../workspace/InvitationPermissions.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as MemberPermissions from "../workspace/MemberPermissions.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as ReplicaRecord from "./ReplicaRecord.ts"

/**
 * One active member's access, as their replica is filtered by it: their grants, and the groups
 * they belong to now.
 *
 * @category models
 * @since 0.1.0
 */
export interface Viewer {
  readonly workspaceId: WorkspaceId.WorkspaceId
  readonly memberId: MemberId.MemberId
  readonly grants: ReadonlyArray<Grant.Grant>
  readonly groupIds: ReadonlySet<GroupId.GroupId>
}

/**
 * What a record's visibility depends on beyond the record: the group it belongs to, and the group
 * of the thread it belongs to. Each is undefined when the workspace has no such group or thread.
 *
 * @category models
 * @since 0.1.0
 */
export interface Places {
  readonly groupOf: (groupId: GroupId.GroupId) => Group.Group | undefined
  readonly threadGroupOf: (threadId: ThreadId.ThreadId) => GroupId.GroupId | undefined
}

/**
 * Whether `viewer` may see `record`, where `places` says what it belongs to.
 *
 * @category predicates
 * @since 0.1.0
 */
export const canSee = (viewer: Viewer, places: Places, record: ReplicaRecord.ReplicaRecord): boolean => {
  const { workspaceId, memberId } = viewer
  const granted = <K extends Target.Kind>(permission: Permission.Definition<K>, target: Target.Of<NoInfer<K>>) =>
    Grant.anyCovers(viewer.grants, Requirement.make(permission, target))
  const memberTarget = (id: MemberId.MemberId) => Target.Reference.cases.Member.make({ workspaceId, memberId: id })
  const groupTarget = (groupId: GroupId.GroupId) => Target.Reference.cases.Group.make({ workspaceId, groupId })
  /** A group and its members: its own members under `group.read`, and a public team whoever may join it. */
  const canSeeGroup = (groupId: GroupId.GroupId) => {
    const group = places.groupOf(groupId)
    if (group === undefined) return false
    if (viewer.groupIds.has(groupId) && granted(GroupPermissions.Read, groupTarget(groupId))) return true
    return (
      group.kind === "Team" &&
      group.visibility === "Public" &&
      granted(GroupMembershipPermissions.Join, groupTarget(groupId))
    )
  }
  /** A thread and everything in it: its group's members under `thread.read` on it. */
  const canSeeThread = (threadId: ThreadId.ThreadId) => {
    const groupId = places.threadGroupOf(threadId)
    return (
      groupId !== undefined &&
      viewer.groupIds.has(groupId) &&
      granted(ThreadPermissions.Read, Target.Reference.cases.Thread.make({ workspaceId, threadId }))
    )
  }
  return Match.valueTags(record, {
    Workspace: () => true,
    Member: ({ value }) => value.id === memberId || granted(MemberPermissions.Read, memberTarget(value.id)),
    Role: () => true,
    Assignment: ({ value }) =>
      value.memberId === memberId || granted(AssignmentPermissions.Read, memberTarget(value.memberId)),
    Invitation: () => granted(InvitationPermissions.Manage, Target.Reference.cases.Workspace.make({ workspaceId })),
    Group: ({ value }) => canSeeGroup(value.id),
    GroupMembership: ({ value }) => value.memberId === memberId || canSeeGroup(value.groupId),
    GroupFollow: ({ value }) => value.memberId === memberId,
    GroupRead: ({ value }) => value.memberId === memberId,
    Thread: ({ value }) => canSeeThread(value.id),
    ThreadActivity: ({ value }) => canSeeThread(value.threadId),
    ThreadMessage: ({ value }) => canSeeThread(value.threadId),
    ThreadParticipation: ({ value }) => canSeeThread(value.threadId),
    ThreadPosition: ({ value }) => value.memberId === memberId,
    Task: ({ value }) => canSeeThread(value.threadId),
    Turn: ({ value }) => canSeeThread(value.threadId),
    Notification: ({ value }) =>
      Notification.Recipient.isAnyOf(["Human"])(value.recipient) && value.recipient.memberId === memberId,
    Connection: ({ value }) =>
      granted(
        ConnectionPermissions.Read,
        Target.Reference.cases.Connection.make({ workspaceId, connectionId: value.id })
      ),
    Agent: ({ value }) => granted(AgentPermissions.Read, memberTarget(value.memberId)),
    Channel: ({ value }) =>
      granted(ChannelPermissions.Read, Target.Reference.cases.Channel.make({ workspaceId, channelId: value.id })),
    ChannelBinding: ({ value }) => canSeeThread(value.threadId),
    Delivery: ({ value }) => canSeeThread(value.threadId),
    Contact: () => true
  })
}

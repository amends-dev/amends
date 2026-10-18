import * as Entry from "@amends-dev/log/Entry"
import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, DateTime, Effect, type Schema } from "effect"
import * as AgentPermissions from "../../src/agent/AgentPermissions.ts"
import * as Assignment from "../../src/authorization/Assignment.ts"
import * as AssignmentPermissions from "../../src/authorization/AssignmentPermissions.ts"
import * as BuiltinRoles from "../../src/authorization/BuiltinRoles.ts"
import type * as Grant from "../../src/authorization/Grant.ts"
import type * as Permission from "../../src/authorization/Permission.ts"
import * as Target from "../../src/authorization/Target.ts"
import * as Channel from "../../src/channel/Channel.ts"
import * as ChannelPermissions from "../../src/channel/ChannelPermissions.ts"
import * as Contact from "../../src/channel/Contact.ts"
import * as Delivery from "../../src/channel/Delivery.ts"
import * as ConnectionPermissions from "../../src/connection/ConnectionPermissions.ts"
import * as Group from "../../src/group/Group.ts"
import * as GroupFollow from "../../src/group/GroupFollow.ts"
import * as GroupId from "../../src/group/GroupId.ts"
import * as GroupMembership from "../../src/group/GroupMembership.ts"
import * as GroupMembershipPermissions from "../../src/group/GroupMembershipPermissions.ts"
import * as GroupPermissions from "../../src/group/GroupPermissions.ts"
import * as Identity from "../../src/identity/Identity.ts"
import * as Notification from "../../src/notification/Notification.ts"
import * as ReplicaRecord from "../../src/replica/ReplicaRecord.ts"
import * as ReplicaVisibility from "../../src/replica/ReplicaVisibility.ts"
import * as Task from "../../src/task/Task.ts"
import * as Thread from "../../src/thread/Thread.ts"
import * as ThreadId from "../../src/thread/ThreadId.ts"
import * as ThreadMessage from "../../src/thread/ThreadMessage.ts"
import * as ThreadPermissions from "../../src/thread/ThreadPermissions.ts"
import * as Invitation from "../../src/workspace/Invitation.ts"
import * as InvitationPermissions from "../../src/workspace/InvitationPermissions.ts"
import * as Member from "../../src/workspace/Member.ts"
import * as MemberId from "../../src/workspace/MemberId.ts"
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts"
import * as Workspace from "../../src/workspace/Workspace.ts"
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace")
const me = MemberId.MemberId.make("me")
const someone = MemberId.MemberId.make("someone")
const mine = GroupId.GroupId.make("mine")
const open = GroupId.GroupId.make("open")
const closed = GroupId.GroupId.make("closed")
const inMine = ThreadId.ThreadId.make("in-mine")
const inClosed = ThreadId.ThreadId.make("in-closed")
const createdAt = DateTime.makeUnsafe("2026-10-18T12:00:00Z")

/** A grant of `permission` across the workspace, or on `target` alone. */
const grant = (permission: Permission.Definition, target?: Target.Reference): Grant.Grant => ({
  permission: permission.name,
  scope: target === undefined ? { _tag: "Workspace", workspaceId } : { _tag: "Target", target }
})
const team = (id: GroupId.GroupId, visibility: Group.Visibility): Group.Group => ({
  id,
  workspaceId,
  kind: "Team",
  visibility,
  name: Group.Name.make(id),
  createdBy: someone,
  createdAt
})
const places: ReplicaVisibility.Places = {
  groupOf: (groupId) =>
    new Map([
      [mine, team(mine, "Private")],
      [open, team(open, "Public")],
      [closed, team(closed, "Private")]
    ]).get(groupId),
  threadGroupOf: (threadId) =>
    new Map([
      [inMine, mine],
      [inClosed, closed]
    ]).get(threadId)
}
/** The viewer, a member of `mine` alone, with `grants`. */
const viewer = (...grants: ReadonlyArray<Grant.Grant>): ReplicaVisibility.Viewer => ({
  workspaceId,
  memberId: me,
  grants,
  groupIds: new Set([mine])
})
/** One generated value of `schema`, which the cases then change where visibility looks. */
const sample = <S extends Schema.Top>(schema: S) =>
  Effect.map(Arbitrary.sampleEffect(Arbitrary.schema(schema), { count: 1, seed: 7 }), ([value]) => value!)
const { cases } = ReplicaRecord.ReplicaRecord

describe("ReplicaVisibility", () => {
  it.effect("shows the workspace's own records to every member, and the rest under their read permission", () =>
    Effect.gen(function* () {
      const member = yield* sample(Member.Member)
      const invitation = yield* sample(Invitation.Invitation)
      const contact = yield* sample(Contact.Contact)
      const channel = yield* sample(Channel.Channel)
      const nobody = viewer()
      expect(
        ReplicaVisibility.canSee(nobody, places, cases.Workspace.make({ value: yield* sample(Workspace.Workspace) }))
      ).toBe(true)
      expect(ReplicaVisibility.canSee(nobody, places, cases.Contact.make({ value: contact }))).toBe(true)
      // A member is seen by themselves, or under member.read on them.
      const someoneElse = cases.Member.make({ value: { ...member, id: someone } })
      expect(ReplicaVisibility.canSee(nobody, places, cases.Member.make({ value: { ...member, id: me } }))).toBe(true)
      expect(ReplicaVisibility.canSee(nobody, places, someoneElse)).toBe(false)
      expect(ReplicaVisibility.canSee(viewer(grant(MemberPermissions.Read)), places, someoneElse)).toBe(true)
      expect(
        ReplicaVisibility.canSee(
          viewer(grant(MemberPermissions.Read, Target.Reference.cases.Member.make({ workspaceId, memberId: me }))),
          places,
          someoneElse
        )
      ).toBe(false)
      // An assignment is seen by its member, or under assignment.read on them.
      const assignment = (memberId: MemberId.MemberId) =>
        cases.Assignment.make({
          value: {
            id: Assignment.AssignmentId.make(`assignment-${memberId}`),
            workspaceId,
            memberId,
            source: { _tag: "Role", roleId: BuiltinRoles.MemberId, scope: { _tag: "Workspace", workspaceId } },
            status: "active"
          }
        })
      expect(ReplicaVisibility.canSee(nobody, places, assignment(me))).toBe(true)
      expect(ReplicaVisibility.canSee(nobody, places, assignment(someone))).toBe(false)
      expect(ReplicaVisibility.canSee(viewer(grant(AssignmentPermissions.Read)), places, assignment(someone))).toBe(
        true
      )
      // Invitations take invitation.manage; channels, connections, and agents their read permission.
      expect(ReplicaVisibility.canSee(nobody, places, cases.Invitation.make({ value: invitation }))).toBe(false)
      expect(
        ReplicaVisibility.canSee(
          viewer(grant(InvitationPermissions.Manage)),
          places,
          cases.Invitation.make({ value: invitation })
        )
      ).toBe(true)
      const channelTarget = Target.Reference.cases.Channel.make({ workspaceId, channelId: channel.id })
      expect(ReplicaVisibility.canSee(nobody, places, cases.Channel.make({ value: channel }))).toBe(false)
      expect(
        ReplicaVisibility.canSee(
          viewer(grant(ChannelPermissions.Read, channelTarget)),
          places,
          cases.Channel.make({ value: channel })
        )
      ).toBe(true)
      const connection = yield* sample(ReplicaRecord.Connection)
      const agent = yield* sample(ReplicaRecord.Agent)
      expect(ReplicaVisibility.canSee(nobody, places, cases.Connection.make({ value: connection }))).toBe(false)
      expect(
        ReplicaVisibility.canSee(
          viewer(grant(ConnectionPermissions.Read)),
          places,
          cases.Connection.make({ value: connection })
        )
      ).toBe(true)
      expect(ReplicaVisibility.canSee(nobody, places, cases.Agent.make({ value: agent }))).toBe(false)
      expect(
        ReplicaVisibility.canSee(
          viewer(
            grant(AgentPermissions.Read, Target.Reference.cases.Member.make({ workspaceId, memberId: agent.memberId }))
          ),
          places,
          cases.Agent.make({ value: agent })
        )
      ).toBe(true)
    })
  )

  it.effect("shows a group and its members to its members under group.read, and a public team to who may join", () =>
    Effect.gen(function* () {
      const membership = yield* sample(GroupMembership.GroupMembership)
      const reader = viewer(grant(GroupPermissions.Read), grant(GroupMembershipPermissions.Join))
      const group = (id: GroupId.GroupId) => cases.Group.make({ value: places.groupOf(id)! })
      const memberOf = (groupId: GroupId.GroupId, memberId = someone) =>
        cases.GroupMembership.make({ value: { ...membership, groupId, memberId } })
      expect(ReplicaVisibility.canSee(reader, places, group(mine))).toBe(true)
      expect(ReplicaVisibility.canSee(reader, places, memberOf(mine))).toBe(true)
      expect(ReplicaVisibility.canSee(viewer(), places, group(mine))).toBe(false)
      // Another group: a public team for whoever may join it, a private one for no one outside.
      expect(ReplicaVisibility.canSee(reader, places, group(open))).toBe(true)
      expect(ReplicaVisibility.canSee(reader, places, memberOf(open))).toBe(true)
      expect(ReplicaVisibility.canSee(viewer(grant(GroupPermissions.Read)), places, group(open))).toBe(false)
      expect(ReplicaVisibility.canSee(reader, places, group(closed))).toBe(false)
      expect(ReplicaVisibility.canSee(reader, places, memberOf(closed))).toBe(false)
      // Their own membership, even of a group they no longer see.
      expect(ReplicaVisibility.canSee(viewer(), places, memberOf(closed, me))).toBe(true)
      // A group the workspace does not have is no one's.
      expect(ReplicaVisibility.canSee(reader, places, memberOf(GroupId.GroupId.make("missing")))).toBe(false)
    })
  )

  it.effect("shows a thread and what is in it to its group's members under thread.read on it", () =>
    Effect.gen(function* () {
      const thread = yield* sample(Thread.Thread)
      const message = yield* sample(ThreadMessage.ThreadMessage)
      const task = yield* sample(Task.Task)
      const delivery = yield* sample(Delivery.Delivery)
      const within = (threadId: ThreadId.ThreadId) => [
        cases.Thread.make({ value: { ...thread, id: threadId } }),
        cases.ThreadMessage.make({ value: { ...message, threadId } }),
        cases.Task.make({ value: { ...task, threadId } }),
        cases.Delivery.make({ value: { ...delivery, threadId } })
      ]
      const everywhere = viewer(grant(ThreadPermissions.Read))
      for (const record of within(inMine)) {
        expect(ReplicaVisibility.canSee(everywhere, places, record)).toBe(true)
        expect(ReplicaVisibility.canSee(viewer(), places, record)).toBe(false)
        // A grant on another thread does not reach this one.
        expect(
          ReplicaVisibility.canSee(
            viewer(
              grant(ThreadPermissions.Read, Target.Reference.cases.Thread.make({ workspaceId, threadId: inClosed }))
            ),
            places,
            record
          )
        ).toBe(false)
      }
      // Outside their groups, and for a thread the workspace does not have, nothing.
      for (const record of [...within(inClosed), ...within(ThreadId.ThreadId.make("missing"))])
        expect(ReplicaVisibility.canSee(everywhere, places, record)).toBe(false)
    })
  )

  it.effect("shows read state, follows, and notifications to their member alone", () =>
    Effect.gen(function* () {
      const follow = yield* sample(GroupFollow.GroupFollow)
      const everything = viewer(
        grant(ThreadPermissions.Read),
        grant(GroupPermissions.Read),
        grant(MemberPermissions.Read)
      )
      const owned = (memberId: MemberId.MemberId) => [
        cases.ThreadPosition.make({ value: { workspaceId, memberId, threadId: inMine, readThrough: 1 } }),
        cases.GroupRead.make({ value: { workspaceId, memberId, groupId: mine, readAt: createdAt } }),
        cases.GroupFollow.make({ value: { ...follow, groupId: mine, memberId } })
      ]
      for (const record of owned(me)) expect(ReplicaVisibility.canSee(viewer(), places, record)).toBe(true)
      for (const record of owned(someone)) expect(ReplicaVisibility.canSee(everything, places, record)).toBe(false)
      const notification = (recipient: Notification.Recipient) =>
        cases.Notification.make({
          value: {
            id: Notification.NotificationId.make(`for-${recipient._tag}`),
            workspaceId,
            source: { logId: Entry.LogId.make("journal"), entryId: Entry.EntryId.make("entry") },
            recipient,
            recordedAt: createdAt,
            state: Notification.State.cases.Pending.make({})
          }
        })
      const human = Identity.HumanId.make("human")
      expect(
        ReplicaVisibility.canSee(
          viewer(),
          places,
          notification(Notification.Recipient.cases.Human.make({ id: human, memberId: me }))
        )
      ).toBe(true)
      expect(
        ReplicaVisibility.canSee(
          everything,
          places,
          notification(Notification.Recipient.cases.Human.make({ id: human, memberId: someone }))
        )
      ).toBe(false)
      expect(
        ReplicaVisibility.canSee(
          everything,
          places,
          notification(Notification.Recipient.cases.Agent.make({ id: Identity.AgentId.make("agent"), memberId: me }))
        )
      ).toBe(false)
    })
  )
})

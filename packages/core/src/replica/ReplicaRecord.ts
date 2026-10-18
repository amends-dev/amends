/**
 * The records a member's replica holds: every kind, with the key each is held under. A replica is
 * the copy of a workspace one member's browser keeps, of what that member may see, and these are
 * the rows it keeps, as core's stores keep them, except where a replica holds a record's own shape:
 * a turn without where its log begins, which only the server reads, and a connection or agent with
 * how ready it is, which only the server can tell.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import * as AgentRecord from "../agent/Agent.ts"
import * as Assignment from "../authorization/Assignment.ts"
import * as Role from "../authorization/Role.ts"
import * as Channel from "../channel/Channel.ts"
import * as ChannelBinding from "../channel/ChannelBinding.ts"
import * as ChannelId from "../channel/ChannelId.ts"
import * as Contact from "../channel/Contact.ts"
import * as Delivery from "../channel/Delivery.ts"
import * as DeliveryId from "../channel/DeliveryId.ts"
import * as ConnectionRecord from "../connection/Connection.ts"
import * as Group from "../group/Group.ts"
import * as GroupFollow from "../group/GroupFollow.ts"
import * as GroupId from "../group/GroupId.ts"
import * as GroupMembership from "../group/GroupMembership.ts"
import * as Identity from "../identity/Identity.ts"
import * as Notification from "../notification/Notification.ts"
import * as ReadState from "../read-state/ReadState.ts"
import * as Task from "../task/Task.ts"
import * as Thread from "../thread/Thread.ts"
import * as ThreadActivity from "../thread/ThreadActivity.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadMessage from "../thread/ThreadMessage.ts"
import * as ThreadMessageId from "../thread/ThreadMessageId.ts"
import * as ThreadParticipation from "../thread/ThreadParticipation.ts"
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts"
import * as TurnRecord from "../turn/Turn.ts"
import * as TurnId from "../turn/TurnId.ts"
import * as Invitation from "../workspace/Invitation.ts"
import * as Member from "../workspace/Member.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as Workspace from "../workspace/Workspace.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * A turn as a replica holds it: without where its log begins, which only the server reads.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Turn = Schema.Struct(Struct.omit(TurnRecord.Turn.fields, ["logAfter"]))

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Turn extends Schema.Schema.Type<typeof Turn> {}

/**
 * A connection as a replica holds it: with how ready it is, as the integration the host installs
 * finds it. Never its key.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Connection = Schema.Struct({
  ...ConnectionRecord.Connection.fields,
  readiness: ConnectionRecord.Readiness
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Connection extends Schema.Schema.Type<typeof Connection> {}

/**
 * An agent as a replica holds it: with whether it can run as it is set up.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Agent = Schema.Struct({ ...AgentRecord.Agent.fields, readiness: AgentRecord.Readiness })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Agent extends Schema.Schema.Type<typeof Agent> {}

/**
 * A record a replica holds, by its kind.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ReplicaRecord = Schema.TaggedUnion({
  Workspace: { value: Workspace.Workspace },
  Member: { value: Member.Member },
  Role: { value: Role.Role },
  Assignment: { value: Assignment.Assignment },
  Invitation: { value: Invitation.Invitation },
  Group: { value: Group.Group },
  GroupMembership: { value: GroupMembership.GroupMembership },
  GroupFollow: { value: GroupFollow.GroupFollow },
  GroupRead: { value: ReadState.GroupRead },
  Thread: { value: Thread.Thread },
  ThreadActivity: { value: ThreadActivity.ThreadActivity },
  ThreadMessage: { value: ThreadMessage.ThreadMessage },
  ThreadParticipation: { value: ThreadParticipation.ThreadParticipation },
  ThreadPosition: { value: ReadState.ThreadPosition },
  Task: { value: Task.Task },
  Turn: { value: Turn },
  Notification: { value: Notification.Notification },
  Connection: { value: Connection },
  Agent: { value: Agent },
  Channel: { value: Channel.Channel },
  ChannelBinding: { value: ChannelBinding.ChannelBinding },
  Delivery: { value: Delivery.Delivery },
  Contact: { value: Contact.Contact }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type ReplicaRecord = typeof ReplicaRecord.Type

/**
 * The kinds of record a replica holds.
 *
 * @category schemas
 * @since 0.1.0
 */
export type Kind = ReplicaRecord["_tag"]

/**
 * The key a replica holds a record under, by its kind: its ID, or what names it when it has none,
 * such as a member and the thread they read. Two records of one kind never share a key.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Key = Schema.TaggedUnion({
  Workspace: { id: WorkspaceId.WorkspaceId },
  Member: { id: MemberId.MemberId },
  Role: { id: Role.RoleId },
  Assignment: { id: Assignment.AssignmentId },
  Invitation: { id: Invitation.InvitationId },
  Group: { id: GroupId.GroupId },
  GroupMembership: { id: GroupMembership.GroupMembershipId },
  GroupFollow: { id: GroupFollow.GroupFollowId },
  GroupRead: { memberId: MemberId.MemberId, groupId: GroupId.GroupId },
  Thread: { id: ThreadId.ThreadId },
  ThreadActivity: { id: ThreadActivity.ThreadActivityId },
  ThreadMessage: { id: ThreadMessageId.ThreadMessageId },
  ThreadParticipation: { id: ThreadParticipationId.ThreadParticipationId },
  ThreadPosition: { memberId: MemberId.MemberId, threadId: ThreadId.ThreadId },
  Task: { threadId: ThreadId.ThreadId },
  Turn: { id: TurnId.TurnId },
  Notification: { id: Notification.NotificationId },
  Connection: { id: ConnectionContract.ConnectionId },
  Agent: { id: Identity.AgentId },
  Channel: { id: ChannelId.ChannelId },
  ChannelBinding: { threadId: ThreadId.ThreadId },
  Delivery: { id: DeliveryId.DeliveryId },
  Contact: { id: Identity.ContactId }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Key = typeof Key.Type

const { cases } = Key

/**
 * The key a replica holds `record` under.
 *
 * @category getters
 * @since 0.1.0
 */
export const keyOf = (record: ReplicaRecord): Key =>
  Match.valueTags(record, {
    Workspace: ({ value }) => cases.Workspace.make({ id: value.id }),
    Member: ({ value }) => cases.Member.make({ id: value.id }),
    Role: ({ value }) => cases.Role.make({ id: value.id }),
    Assignment: ({ value }) => cases.Assignment.make({ id: value.id }),
    Invitation: ({ value }) => cases.Invitation.make({ id: value.details.id }),
    Group: ({ value }) => cases.Group.make({ id: value.id }),
    GroupMembership: ({ value }) => cases.GroupMembership.make({ id: value.id }),
    GroupFollow: ({ value }) => cases.GroupFollow.make({ id: value.id }),
    GroupRead: ({ value }) => cases.GroupRead.make({ memberId: value.memberId, groupId: value.groupId }),
    Thread: ({ value }) => cases.Thread.make({ id: value.id }),
    ThreadActivity: ({ value }) => cases.ThreadActivity.make({ id: value.id }),
    ThreadMessage: ({ value }) => cases.ThreadMessage.make({ id: value.id }),
    ThreadParticipation: ({ value }) => cases.ThreadParticipation.make({ id: value.id }),
    ThreadPosition: ({ value }) => cases.ThreadPosition.make({ memberId: value.memberId, threadId: value.threadId }),
    Task: ({ value }) => cases.Task.make({ threadId: value.threadId }),
    Turn: ({ value }) => cases.Turn.make({ id: value.id }),
    Notification: ({ value }) => cases.Notification.make({ id: value.id }),
    Connection: ({ value }) => cases.Connection.make({ id: value.id }),
    Agent: ({ value }) => cases.Agent.make({ id: value.id }),
    Channel: ({ value }) => cases.Channel.make({ id: value.id }),
    ChannelBinding: ({ value }) => cases.ChannelBinding.make({ threadId: value.threadId }),
    Delivery: ({ value }) => cases.Delivery.make({ id: value.id }),
    Contact: ({ value }) => cases.Contact.make({ id: value.id })
  })

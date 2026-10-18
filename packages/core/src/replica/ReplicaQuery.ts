/**
 * The reads a replica is built from: which records a commit changed, and those records as they are
 * now. A fact's subject names the record it changes, and a few facts change more as their
 * projections apply them: a thread's activity generates notifications, a member leaving a group
 * ends their participations there and settles their notifications from it, reading a thread marks
 * what was pending from it seen, and a connection's change can change whether the agents that use
 * it can run. Only a person's notifications are ever in a replica, so the settling of an agent's or
 * a contact's is left out.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract, Integrations } from "@amends-dev/connection"
import type * as Log from "@amends-dev/log/Log"
import type * as StoreError from "@amends-dev/log/StoreError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Struct from "effect/Struct"
import * as AgentReadiness from "../agent/AgentReadiness.ts"
import * as AgentStore from "../agent/AgentStore.ts"
import * as Assignment from "../authorization/Assignment.ts"
import * as AssignmentStore from "../authorization/AssignmentStore.ts"
import * as BuiltinRoles from "../authorization/BuiltinRoles.ts"
import * as GrantResolver from "../authorization/GrantResolver.ts"
import * as Role from "../authorization/Role.ts"
import * as RoleStore from "../authorization/RoleStore.ts"
import * as ChannelBindingStore from "../channel/ChannelBindingStore.ts"
import * as ChannelId from "../channel/ChannelId.ts"
import * as ChannelStore from "../channel/ChannelStore.ts"
import * as ContactStore from "../channel/ContactStore.ts"
import * as DeliveryId from "../channel/DeliveryId.ts"
import * as DeliveryStore from "../channel/DeliveryStore.ts"
import type * as Connection from "../connection/Connection.ts"
import * as ConnectionReadiness from "../connection/ConnectionReadiness.ts"
import * as ConnectionStore from "../connection/ConnectionStore.ts"
import type * as Group from "../group/Group.ts"
import * as GroupFollow from "../group/GroupFollow.ts"
import * as GroupFollowStore from "../group/GroupFollowStore.ts"
import * as GroupId from "../group/GroupId.ts"
import * as GroupMembership from "../group/GroupMembership.ts"
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts"
import * as GroupMembershipStore from "../group/GroupMembershipStore.ts"
import * as GroupStore from "../group/GroupStore.ts"
import * as Identity from "../identity/Identity.ts"
import * as Event from "../journal/Event.ts"
import * as Notification from "../notification/Notification.ts"
import * as NotificationStore from "../notification/NotificationStore.ts"
import * as ReadStateFacts from "../read-state/ReadStateFacts.ts"
import * as ReadStateStore from "../read-state/ReadStateStore.ts"
import * as TaskStore from "../task/TaskStore.ts"
import type * as Thread from "../thread/Thread.ts"
import * as ThreadActivity from "../thread/ThreadActivity.ts"
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts"
import * as ThreadActivityStore from "../thread/ThreadActivityStore.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadMessageId from "../thread/ThreadMessageId.ts"
import * as ThreadMessageStore from "../thread/ThreadMessageStore.ts"
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts"
import * as ThreadParticipationStore from "../thread/ThreadParticipationStore.ts"
import * as ThreadStore from "../thread/ThreadStore.ts"
import * as TurnId from "../turn/TurnId.ts"
import * as TurnStore from "../turn/TurnStore.ts"
import * as Invitation from "../workspace/Invitation.ts"
import * as InvitationStore from "../workspace/InvitationStore.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as WorkspaceStore from "../workspace/WorkspaceStore.ts"
import * as ReplicaRecord from "./ReplicaRecord.ts"
import * as ReplicaVisibility from "./ReplicaVisibility.ts"

/**
 * What the replica's reads fail with: storage, and a stored value or fact that does not decode.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = StoreError.StoreError | Schema.SchemaError | Event.FactMismatch

/**
 * The replica's shared reads, which only core's replica operations call.
 *
 * @category services
 * @since 0.1.0
 */
export class ReplicaQuery extends Context.Service<
  ReplicaQuery,
  {
    /** The keys of the records one commit's entries changed, among those a replica can hold, once each. */
    readonly keysChangedBy: (
      entries: ReadonlyArray<Log.Entry<Event.Envelope>>
    ) => Effect.Effect<ReadonlyArray<ReplicaRecord.Key>, Error>
    /** The records stored under `keys` now, as a replica holds them; a key with no record is left out. */
    readonly readRecords: (
      keys: ReadonlyArray<ReplicaRecord.Key>
    ) => Effect.Effect<ReadonlyArray<ReplicaRecord.ReplicaRecord>, Error>
    /** A member's access now: their grants, and the groups they belong to. */
    readonly viewerOf: (memberId: MemberId.MemberId) => Effect.Effect<ReplicaVisibility.Viewer, Error>
    /** The groups and threads `records` belong to, as `ReplicaVisibility.canSee` asks for them. */
    readonly placesOf: (
      records: ReadonlyArray<ReplicaRecord.ReplicaRecord>
    ) => Effect.Effect<ReplicaVisibility.Places, Error>
    /**
     * Every record `viewer` may see now, a group and a thread at a time: the workspace's own
     * records, then each group they may see with what it holds, then their notifications. What has
     * ended where a replica no longer reads it is left out: a revoked assignment, a removed
     * connection or channel, and an ended follow.
     */
    readonly snapshot: (viewer: ReplicaVisibility.Viewer) => Stream.Stream<ReplicaRecord.ReplicaRecord, Error>
  }
>()("@amends-dev/core/replica/ReplicaQuery") {}

const { cases: keys } = ReplicaRecord.Key
const decodeMemberGroup = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Tuple([MemberId.MemberId, GroupId.GroupId]))
)
const decodeMemberThread = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Tuple([MemberId.MemberId, ThreadId.ThreadId]))
)
/** The roles a revision of the built-in roles changes. */
const builtinRoleIds = [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId]
/** How many notifications one page of a person's inbox reads. */
const inboxPage = 100

/**
 * Builds the replica's reads over the workspace's stores and the host's integrations.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const workspaceStore = yield* WorkspaceStore.WorkspaceStore
  const memberStore = yield* MemberStore.MemberStore
  const roleStore = yield* RoleStore.RoleStore
  const assignmentStore = yield* AssignmentStore.AssignmentStore
  const invitationStore = yield* InvitationStore.InvitationStore
  const groupStore = yield* GroupStore.GroupStore
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore
  const groupFollowStore = yield* GroupFollowStore.GroupFollowStore
  const readStateStore = yield* ReadStateStore.ReadStateStore
  const threadStore = yield* ThreadStore.ThreadStore
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore
  const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore
  const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore
  const taskStore = yield* TaskStore.TaskStore
  const turnStore = yield* TurnStore.TurnStore
  const notificationStore = yield* NotificationStore.NotificationStore
  const connectionStore = yield* ConnectionStore.ConnectionStore
  const agentStore = yield* AgentStore.AgentStore
  const channelStore = yield* ChannelStore.ChannelStore
  const channelBindingStore = yield* ChannelBindingStore.ChannelBindingStore
  const deliveryStore = yield* DeliveryStore.DeliveryStore
  const contactStore = yield* ContactStore.ContactStore
  const integrations = yield* Integrations.Integrations
  const grantResolver = yield* GrantResolver.GrantResolver
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId

  /** A person's notifications are addressed to their membership; none for an agent or a missing member. */
  const personAsRecipient = Effect.fnUntraced(function* (memberId: MemberId.MemberId) {
    const member = yield* memberStore.get(memberId)
    if (Option.isNone(member) || !Identity.MemberReference.isAnyOf(["Human"])(member.value.identity))
      return Option.none<Notification.Recipient>()
    return Option.some<Notification.Recipient>(Notification.ofMember(memberId, member.value.identity))
  })

  /** The agents whose setup names the connection, whose readiness follows it. */
  const agentsNaming = Effect.fnUntraced(function* (connectionId: ConnectionContract.ConnectionId) {
    return (yield* agentStore.list)
      .filter((agent) => AgentReadiness.namedConnections(agent).some((named) => named.connectionId === connectionId))
      .map((agent) => keys.Agent.make({ id: agent.id }))
  })

  /** The records a fact's subject names. A request's outcome is no record. */
  const keysOfSubject = Effect.fnUntraced(function* (
    subject: string
  ): Effect.fn.Return<ReadonlyArray<ReplicaRecord.Key>, Error> {
    const separator = subject.indexOf(":")
    const kind = subject.slice(0, separator)
    const id = subject.slice(separator + 1)
    switch (kind) {
      case "workspace":
        return [keys.Workspace.make({ id: WorkspaceId.WorkspaceId.make(id) })]
      case "member":
        return [keys.Member.make({ id: MemberId.MemberId.make(id) })]
      case "role":
        return [keys.Role.make({ id: Role.RoleId.make(id) })]
      case "builtin-roles":
        return builtinRoleIds.map((roleId) => keys.Role.make({ id: roleId }))
      case "assignment":
        return [keys.Assignment.make({ id: Assignment.AssignmentId.make(id) })]
      case "invitation":
        return [keys.Invitation.make({ id: Invitation.InvitationId.make(id) })]
      case "group":
        return [keys.Group.make({ id: GroupId.GroupId.make(id) })]
      case "group-membership":
        return [keys.GroupMembership.make({ id: GroupMembership.GroupMembershipId.make(id) })]
      case "group-follow":
        return [keys.GroupFollow.make({ id: GroupFollow.GroupFollowId.make(id) })]
      case "group-read": {
        const [memberId, groupId] = yield* decodeMemberGroup(id)
        return [keys.GroupRead.make({ memberId, groupId })]
      }
      case "thread":
        return [keys.Thread.make({ id: ThreadId.ThreadId.make(id) })]
      case "thread-activity":
        return [keys.ThreadActivity.make({ id: ThreadActivity.ThreadActivityId.make(id) })]
      case "thread-message":
        return [keys.ThreadMessage.make({ id: ThreadMessageId.ThreadMessageId.make(id) })]
      case "thread-participation":
        return [keys.ThreadParticipation.make({ id: ThreadParticipationId.ThreadParticipationId.make(id) })]
      case "thread-position": {
        const [memberId, threadId] = yield* decodeMemberThread(id)
        return [keys.ThreadPosition.make({ memberId, threadId })]
      }
      case "task":
        return [keys.Task.make({ threadId: ThreadId.ThreadId.make(id) })]
      case "turn":
        return [keys.Turn.make({ id: TurnId.TurnId.make(id) })]
      case "notification":
        return [keys.Notification.make({ id: Notification.NotificationId.make(id) })]
      case "connection": {
        const connectionId = ConnectionContract.ConnectionId.make(id)
        return [keys.Connection.make({ id: connectionId }), ...(yield* agentsNaming(connectionId))]
      }
      case "agent":
        return [keys.Agent.make({ id: Identity.AgentId.make(id) })]
      case "channel":
        return [keys.Channel.make({ id: ChannelId.ChannelId.make(id) })]
      case "channel-binding":
        return [keys.ChannelBinding.make({ threadId: ThreadId.ThreadId.make(id) })]
      case "channel-delivery":
        return [keys.Delivery.make({ id: DeliveryId.DeliveryId.make(id) })]
      case "contact":
        return [keys.Contact.make({ id: Identity.ContactId.make(id) })]
      case "request":
        return []
      default:
        return yield* Effect.die(`The replica knows no record of the subject kind ${kind}`)
    }
  })

  /** The people's notifications an activity generated. */
  const notificationsGenerated = Effect.fnUntraced(function* (entry: Log.Entry<Event.Envelope>) {
    const { payload } = yield* Event.decode(ThreadActivityFacts.Recorded, entry)
    return payload.recipients.flatMap(({ recipient, participationId }) =>
      Notification.Recipient.isAnyOf(["Human"])(recipient)
        ? [keys.Notification.make({ id: Notification.idForActivity(entry, participationId) })]
        : []
    )
  })

  /** A member leaving a group ends what they took part in there, and settles what they had pending. */
  const departure = Effect.fnUntraced(function* (entry: Log.Entry<Event.Envelope>) {
    const { payload } = yield* Event.decode(GroupMembershipFacts.Removed, entry)
    const participations = (yield* threadParticipationStore.listByAdmission(payload.membershipId)).map(
      (participation) => keys.ThreadParticipation.make({ id: participation.id })
    )
    const recipient = yield* personAsRecipient(payload.memberId)
    if (Option.isNone(recipient)) return participations
    const settled: Array<ReplicaRecord.Key> = []
    let before: NotificationStore.Cursor | undefined
    while (true) {
      const page = yield* notificationStore.listLatestByRecipient(
        recipient.value,
        before === undefined ? { limit: inboxPage } : { limit: inboxPage, before }
      )
      for (const notification of page)
        if (notification.thread?.groupId === payload.groupId)
          settled.push(keys.Notification.make({ id: notification.id }))
      const last = page.at(-1)
      if (last === undefined || page.length < inboxPage) return [...participations, ...settled]
      before = { recordedAt: last.recordedAt, id: last.id }
    }
  })

  /** Reading a thread marks what the person had pending from it, up to the position, seen. */
  const notificationsSeenInThread = Effect.fnUntraced(function* (entry: Log.Entry<Event.Envelope>) {
    const { payload } = yield* Event.decode(ReadStateFacts.ThreadRead, entry)
    const recipient = yield* personAsRecipient(payload.memberId)
    if (Option.isNone(recipient)) return []
    const seen = yield* notificationStore.listByThread(recipient.value, payload.threadId, {
      afterSequence: 0,
      throughSequence: payload.readThrough
    })
    return seen.map((notification) => keys.Notification.make({ id: notification.id }))
  })

  /** What a fact's projections change beside its subject. */
  const sideEffects = new Map<
    string,
    (entry: Log.Entry<Event.Envelope>) => Effect.Effect<ReadonlyArray<ReplicaRecord.Key>, Error>
  >([
    [ThreadActivityFacts.Recorded.name, notificationsGenerated],
    [GroupMembershipFacts.Removed.name, departure],
    [ReadStateFacts.ThreadRead.name, notificationsSeenInThread]
  ])

  const keysChangedBy = Effect.fn("ReplicaQuery.keysChangedBy")(function* (
    entries: ReadonlyArray<Log.Entry<Event.Envelope>>
  ) {
    const changed = new Map<string, ReplicaRecord.Key>()
    for (const entry of entries) {
      const sideEffect = sideEffects.get(entry.payload.name)
      for (const key of [
        ...(yield* keysOfSubject(entry.payload.subject)),
        ...(sideEffect === undefined ? [] : yield* sideEffect(entry))
      ])
        changed.set(JSON.stringify(key), key)
    }
    return [...changed.values()]
  })

  /** A connection as a replica holds it, with how ready it is now. */
  const withReadiness = (connection: Connection.Connection) =>
    Effect.map(ConnectionReadiness.readinessOf(connection, integrations), (readiness) =>
      ReplicaRecord.ReplicaRecord.cases.Connection.make({ value: Object.assign({}, connection, { readiness }) })
    )

  /** The record stored under one key now, as a replica holds it. */
  const readRecord = (key: ReplicaRecord.Key): Effect.Effect<Option.Option<ReplicaRecord.ReplicaRecord>, Error> => {
    const { cases } = ReplicaRecord.ReplicaRecord
    const found = <A>(
      read: Effect.Effect<Option.Option<A>, Error>,
      toRecord: (value: A) => ReplicaRecord.ReplicaRecord
    ) => Effect.map(read, Option.map(toRecord))
    return Match.valueTags(key, {
      Workspace: () => found(workspaceStore.get, (value) => cases.Workspace.make({ value })),
      Member: ({ id }) => found(memberStore.get(id), (value) => cases.Member.make({ value })),
      Role: ({ id }) => found(roleStore.get(id), (value) => cases.Role.make({ value })),
      Assignment: ({ id }) => found(assignmentStore.get(id), (value) => cases.Assignment.make({ value })),
      Invitation: ({ id }) => found(invitationStore.get(id), (value) => cases.Invitation.make({ value })),
      Group: ({ id }) => found(groupStore.get(id), (value) => cases.Group.make({ value })),
      GroupMembership: ({ id }) =>
        found(groupMembershipStore.get(id), (value) => cases.GroupMembership.make({ value })),
      GroupFollow: ({ id }) => found(groupFollowStore.get(id), (value) => cases.GroupFollow.make({ value })),
      GroupRead: ({ memberId, groupId }) =>
        Effect.map(readStateStore.getGroupReads(memberId, [groupId]), ([value]) =>
          Option.map(Option.fromUndefinedOr(value), (value) => cases.GroupRead.make({ value }))
        ),
      Thread: ({ id }) => found(threadStore.get(id), (value) => cases.Thread.make({ value })),
      ThreadActivity: ({ id }) => found(threadActivityStore.get(id), (value) => cases.ThreadActivity.make({ value })),
      ThreadMessage: ({ id }) => found(threadMessageStore.get(id), (value) => cases.ThreadMessage.make({ value })),
      ThreadParticipation: ({ id }) =>
        found(threadParticipationStore.get(id), (value) => cases.ThreadParticipation.make({ value })),
      ThreadPosition: ({ memberId, threadId }) =>
        Effect.map(readStateStore.getThreadPositions(memberId, [threadId]), ([value]) =>
          Option.map(Option.fromUndefinedOr(value), (value) => cases.ThreadPosition.make({ value }))
        ),
      Task: ({ threadId }) => found(taskStore.get(threadId), (value) => cases.Task.make({ value })),
      Turn: ({ id }) =>
        found(turnStore.get(id), (value) => cases.Turn.make({ value: Struct.omit(value, ["logAfter"]) })),
      Notification: ({ id }) => found(notificationStore.get(id), (value) => cases.Notification.make({ value })),
      Connection: ({ id }) =>
        Effect.flatMap(connectionStore.get(id), (connection) =>
          Option.isNone(connection) ? Effect.succeedNone : Effect.asSome(withReadiness(connection.value))
        ),
      Agent: ({ id }) =>
        Effect.flatMap(agentStore.get(id), (agent) =>
          Option.isNone(agent)
            ? Effect.succeedNone
            : Effect.gen(function* () {
                const issues = yield* AgentReadiness.issuesOf(
                  agent.value,
                  yield* connectionStore.listActive,
                  integrations
                )
                return Option.some(
                  cases.Agent.make({
                    value: Object.assign({}, agent.value, { readiness: AgentReadiness.readinessOf(issues) })
                  })
                )
              })
        ),
      Channel: ({ id }) => found(channelStore.get(id), (value) => cases.Channel.make({ value })),
      ChannelBinding: ({ threadId }) =>
        found(channelBindingStore.get(threadId), (value) => cases.ChannelBinding.make({ value })),
      Delivery: ({ id }) => found(deliveryStore.get(id), (value) => cases.Delivery.make({ value })),
      Contact: ({ id }) => found(contactStore.get(id), (value) => cases.Contact.make({ value }))
    })
  }

  const readRecords = Effect.fn("ReplicaQuery.readRecords")(function* (keys: ReadonlyArray<ReplicaRecord.Key>) {
    const records: Array<ReplicaRecord.ReplicaRecord> = []
    for (const key of keys) {
      const record = yield* readRecord(key)
      if (Option.isSome(record)) records.push(record.value)
    }
    return records
  })

  const viewerOf = Effect.fn("ReplicaQuery.viewerOf")(function* (memberId: MemberId.MemberId) {
    const grants = yield* grantResolver.resolve(memberId)
    const admissions = yield* groupMembershipStore.listActiveByMember(memberId)
    return { workspaceId, memberId, grants, groupIds: new Set(admissions.map(({ groupId }) => groupId)) }
  })

  /** Places over groups and threads already read. */
  const placesFrom = (
    groups: ReadonlyArray<Group.Group>,
    threads: ReadonlyArray<{ readonly id: ThreadId.ThreadId; readonly groupId: GroupId.GroupId }>
  ): ReplicaVisibility.Places => {
    const groupsById = new Map(groups.map((group) => [group.id, group] as const))
    const threadGroups = new Map(threads.map((thread) => [thread.id, thread.groupId] as const))
    return { groupOf: (id) => groupsById.get(id), threadGroupOf: (id) => threadGroups.get(id) }
  }

  const placesOf = Effect.fn("ReplicaQuery.placesOf")(function* (records: ReadonlyArray<ReplicaRecord.ReplicaRecord>) {
    const groupIds = new Set<GroupId.GroupId>()
    const threadIds = new Set<ThreadId.ThreadId>()
    const { isAnyOf } = ReplicaRecord.ReplicaRecord
    for (const record of records) {
      if (isAnyOf(["Group"])(record)) groupIds.add(record.value.id)
      else if (isAnyOf(["GroupMembership", "GroupFollow"])(record)) groupIds.add(record.value.groupId)
      else if (isAnyOf(["Thread"])(record)) threadIds.add(record.value.id)
      else if (
        isAnyOf([
          "ThreadActivity",
          "ThreadMessage",
          "ThreadParticipation",
          "Task",
          "Turn",
          "ChannelBinding",
          "Delivery"
        ])(record)
      )
        threadIds.add(record.value.threadId)
    }
    return placesFrom(yield* groupStore.getMany([...groupIds]), yield* threadStore.getMany([...threadIds]))
  })

  /** Connections and agents as a replica holds them, with how ready each is now. */
  const readConnectionsAndAgents = Effect.gen(function* () {
    const connections = yield* connectionStore.listActive
    const agents = yield* agentStore.list
    return [
      ...(yield* Effect.forEach(connections, withReadiness)),
      ...(yield* Effect.forEach(agents, (agent) =>
        Effect.map(AgentReadiness.issuesOf(agent, connections, integrations), (issues) =>
          ReplicaRecord.ReplicaRecord.cases.Agent.make({
            value: Object.assign({}, agent, { readiness: AgentReadiness.readinessOf(issues) })
          })
        )
      ))
    ]
  })

  /** The records of the workspace itself, rather than of a group or a thread. */
  const readWorkspaceRecords = Effect.gen(function* () {
    const { cases } = ReplicaRecord.ReplicaRecord
    const members = yield* memberStore.list
    return [
      ...Option.toArray(yield* workspaceStore.get).map((value) => cases.Workspace.make({ value })),
      ...members.map((value) => cases.Member.make({ value })),
      ...(yield* roleStore.list).map((value) => cases.Role.make({ value })),
      ...(yield* Effect.forEach(members, ({ id }) => assignmentStore.listActiveByMember(id))).flatMap((assignments) =>
        assignments.map((value) => cases.Assignment.make({ value }))
      ),
      ...(yield* invitationStore.list).map((value) => cases.Invitation.make({ value })),
      ...(yield* contactStore.list).map((value) => cases.Contact.make({ value })),
      ...(yield* channelStore.listActive).map((value) => cases.Channel.make({ value })),
      ...(yield* readConnectionsAndAgents)
    ]
  })

  /** The groups `viewer` may see: those they belong to, and the public teams. */
  const readVisibleGroups = Effect.fnUntraced(function* (viewer: ReplicaVisibility.Viewer) {
    const publicTeams: Array<Group.Group> = []
    let after: GroupId.GroupId | undefined
    while (true) {
      const page = yield* groupStore.pagePublic(after === undefined ? { limit: 100 } : { after, limit: 100 })
      publicTeams.push(...page)
      const last = page.at(-1)
      if (last === undefined || page.length < 100) break
      after = last.id
    }
    const theirs = yield* groupStore.getMany([...viewer.groupIds])
    const groups = new Map([...publicTeams, ...theirs].map((group) => [group.id, group] as const))
    const places = placesFrom([...groups.values()], [])
    return [...groups.values()].filter((value) =>
      ReplicaVisibility.canSee(viewer, places, ReplicaRecord.ReplicaRecord.cases.Group.make({ value }))
    )
  })

  /** A group the viewer may see: its record, its admissions, and their own follow of it and read time. */
  const readGroupRecords = Effect.fnUntraced(function* (viewer: ReplicaVisibility.Viewer, group: Group.Group) {
    const { cases } = ReplicaRecord.ReplicaRecord
    const memberships = yield* groupMembershipStore.listByGroup(group.id)
    const own = memberships.find(
      (membership) => membership.memberId === viewer.memberId && membership.status === "active"
    )
    const follow =
      own === undefined ? Option.none<GroupFollow.GroupFollow>() : yield* groupFollowStore.findActive(own.id)
    return [
      cases.Group.make({ value: group }),
      ...memberships.map((value) => cases.GroupMembership.make({ value })),
      ...Option.toArray(follow).map((value) => cases.GroupFollow.make({ value })),
      ...(yield* readStateStore.getGroupReads(viewer.memberId, [group.id])).map((value) =>
        cases.GroupRead.make({ value })
      )
    ]
  })

  /** A thread the viewer may see, with everything in it and how far they read it. */
  const readThreadRecords = Effect.fnUntraced(function* (viewer: ReplicaVisibility.Viewer, thread: Thread.Thread) {
    const { cases } = ReplicaRecord.ReplicaRecord
    return [
      cases.Thread.make({ value: thread }),
      ...(yield* threadActivityStore.listByThread(thread.id)).map((value) => cases.ThreadActivity.make({ value })),
      ...(yield* threadMessageStore.listByThread(thread.id)).map((value) => cases.ThreadMessage.make({ value })),
      ...(yield* threadParticipationStore.listByThread(thread.id)).map((value) =>
        cases.ThreadParticipation.make({ value })
      ),
      ...Option.toArray(yield* taskStore.get(thread.id)).map((value) => cases.Task.make({ value })),
      ...(yield* turnStore.listByThread(thread.id)).map((value) =>
        cases.Turn.make({ value: Struct.omit(value, ["logAfter"]) })
      ),
      ...Option.toArray(yield* channelBindingStore.get(thread.id)).map((value) => cases.ChannelBinding.make({ value })),
      ...(yield* deliveryStore.listByThread(thread.id)).map((value) => cases.Delivery.make({ value })),
      ...(yield* readStateStore.getThreadPositions(viewer.memberId, [thread.id])).map((value) =>
        cases.ThreadPosition.make({ value })
      )
    ]
  })

  /** The viewer's own notifications, newest first, a page at a time. */
  const readNotifications = (viewer: ReplicaVisibility.Viewer) =>
    Stream.unwrap(
      Effect.map(personAsRecipient(viewer.memberId), (recipient) =>
        Option.isNone(recipient)
          ? Stream.empty
          : Stream.paginate(Option.none<NotificationStore.Cursor>(), (before) =>
              Effect.map(
                notificationStore.listLatestByRecipient(
                  recipient.value,
                  Option.isNone(before) ? { limit: inboxPage } : { limit: inboxPage, before: before.value }
                ),
                (page) => {
                  const last = page.at(-1)
                  const records = page.map((value) => ReplicaRecord.ReplicaRecord.cases.Notification.make({ value }))
                  return [
                    records,
                    last === undefined || page.length < inboxPage
                      ? Option.none<Option.Option<NotificationStore.Cursor>>()
                      : Option.some(Option.some({ recordedAt: last.recordedAt, id: last.id }))
                  ] as const
                }
              )
            )
      )
    )

  const snapshot = (viewer: ReplicaVisibility.Viewer): Stream.Stream<ReplicaRecord.ReplicaRecord, Error> => {
    const visible = (places: ReplicaVisibility.Places) => (records: ReadonlyArray<ReplicaRecord.ReplicaRecord>) =>
      records.filter((record) => ReplicaVisibility.canSee(viewer, places, record))
    const workspaceRecords = Stream.fromIterableEffect(Effect.map(readWorkspaceRecords, visible(placesFrom([], []))))
    const groupRecords = Stream.fromIterableEffect(readVisibleGroups(viewer)).pipe(
      Stream.flatMap((group) =>
        Stream.concat(
          Stream.fromIterableEffect(Effect.map(readGroupRecords(viewer, group), visible(placesFrom([group], [])))),
          Stream.fromIterableEffect(threadStore.listByGroup(group.id)).pipe(
            Stream.flatMap((thread) =>
              Stream.fromIterableEffect(
                Effect.map(readThreadRecords(viewer, thread), visible(placesFrom([group], [thread])))
              )
            )
          )
        )
      )
    )
    return Stream.concat(Stream.concat(workspaceRecords, groupRecords), readNotifications(viewer))
  }

  return ReplicaQuery.of({ keysChangedBy, readRecords, viewerOf, placesOf, snapshot })
})

/**
 * Provide the replica's reads over the workspace's stores, grant resolution, and the host's
 * integrations.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ReplicaQuery, make)

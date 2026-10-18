/**
 * What an action the person writes does to their replica until the server's changes arrive, so they
 * see it at once, even offline. An action may create records, worked out as it is written from its
 * payload and the records it names as the person sees them, under the IDs core derives from its key,
 * the request key the server runs it under, so the server's own records take their place; and it
 * may change records the replica holds, applied on top of the
 * server's records each time they are read, so whatever the server changes meanwhile shows through
 * what the action leaves alone. Unfinished actions apply in the order they were written, each to what
 * the ones before it left; one the server completed or rejected no longer applies.
 */

import { Assignment, type Role, Scope } from "@amends-dev/core/authorization"
import { Group, type GroupFollow, GroupMembership } from "@amends-dev/core/group"
import { Notification, NotificationStore } from "@amends-dev/core/notification"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadMessage, ThreadParticipation } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import { Invitation, type MemberId, type WorkspaceId } from "@amends-dev/core/workspace"
import type * as ConnectionSync from "@amends-dev/sync/ConnectionSync"
import type * as GroupSync from "@amends-dev/sync/GroupSync"
import type * as NotificationSync from "@amends-dev/sync/NotificationSync"
import * as SyncSchema from "@amends-dev/sync/SyncSchema"
import type * as TaskSync from "@amends-dev/sync/TaskSync"
import type * as ThreadSync from "@amends-dev/sync/ThreadSync"
import type * as TurnSync from "@amends-dev/sync/TurnSync"
import type * as WorkspaceSync from "@amends-dev/sync/WorkspaceSync"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import * as Array from "effect/Array"
import type * as Crypto from "effect/Crypto"
import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as Option from "effect/Option"
import type * as PlatformError from "effect/PlatformError"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import type * as Replica from "./Replica.ts"

/** An action the person wrote: who wrote it, in which workspace, under which key, and when. */
export interface Action {
  readonly workspaceId: WorkspaceId.WorkspaceId
  readonly memberId: MemberId.MemberId
  readonly key: Request.Key
  readonly writtenAt: DateTime.Utc
}

/**
 * The record under `key` as the person sees it while an action is written: what an action creates
 * records from when its payload only names it, as a task copies its thread's group.
 */
export type Find = <Kind extends ReplicaRecord.Kind>(
  key: Replica.KeyOf<Kind>
) => Effect.Effect<Option.Option<Replica.RecordOf<Kind>>, IndexedDbQueryBuilder.IndexedDbQueryError>

/** What an action with `Payload` does to the replica until the server's changes arrive. */
export interface Effects<Payload> {
  /** The records it creates. */
  readonly creates?: (
    payload: Payload,
    action: Action,
    find: Find
  ) => Effect.Effect<
    ReadonlyArray<ReplicaRecord.ReplicaRecord>,
    PlatformError.PlatformError | IndexedDbQueryBuilder.IndexedDbQueryError,
    Crypto.Crypto
  >
  /** `record` as it changes it, or undefined when it leaves `record` alone. */
  readonly changes?: (
    payload: Payload,
    record: ReplicaRecord.ReplicaRecord,
    action: Action
  ) => ReplicaRecord.ReplicaRecord | undefined
}

/** The effects of a group's actions, by tag; an action left out does nothing until the server's changes arrive. */
export type EffectsOf<Group extends EventGroup.Any> = {
  readonly [Tag in Event.Tag<EventGroup.Events<Group>>]?: Effects<Event.PayloadWithTag<EventGroup.Events<Group>, Tag>>
}

const { cases } = ReplicaRecord.ReplicaRecord
const isThread = ReplicaRecord.ReplicaRecord.isAnyOf(["Thread"])
const isMessage = ReplicaRecord.ReplicaRecord.isAnyOf(["ThreadMessage"])
const isGroup = ReplicaRecord.ReplicaRecord.isAnyOf(["Group"])
const isParticipation = ReplicaRecord.ReplicaRecord.isAnyOf(["ThreadParticipation"])
const isPosition = ReplicaRecord.ReplicaRecord.isAnyOf(["ThreadPosition"])
const isMembership = ReplicaRecord.ReplicaRecord.isAnyOf(["GroupMembership"])
const isFollow = ReplicaRecord.ReplicaRecord.isAnyOf(["GroupFollow"])
const isGroupRead = ReplicaRecord.ReplicaRecord.isAnyOf(["GroupRead"])
const isWorkspace = ReplicaRecord.ReplicaRecord.isAnyOf(["Workspace"])
const isMember = ReplicaRecord.ReplicaRecord.isAnyOf(["Member"])
const isAssignment = ReplicaRecord.ReplicaRecord.isAnyOf(["Assignment"])
const isInvitation = ReplicaRecord.ReplicaRecord.isAnyOf(["Invitation"])
const isNotification = ReplicaRecord.ReplicaRecord.isAnyOf(["Notification"])
const isTask = ReplicaRecord.ReplicaRecord.isAnyOf(["Task"])
const isTurn = ReplicaRecord.ReplicaRecord.isAnyOf(["Turn"])
const isConnection = ReplicaRecord.ReplicaRecord.isAnyOf(["Connection"])

/** `record`, a notification, as seen when `action` was written. */
const seen = (record: Replica.RecordOf<"Notification">, action: Action) =>
  cases.Notification.make({
    value: { ...record.value, state: Notification.State.cases.Seen.make({ seenAt: action.writtenAt }) }
  })

/** Whether `record` is a notification still waiting for `action`'s author to see it. */
const isOwnPending = (
  record: ReplicaRecord.ReplicaRecord,
  action: Action
): record is Replica.RecordOf<"Notification"> =>
  isNotification(record) &&
  Notification.Recipient.isAnyOf(["Human"])(record.value.recipient) &&
  record.value.recipient.memberId === action.memberId &&
  Notification.State.isAnyOf(["Pending"])(record.value.state)

/** Whether `participation` is `memberId`'s own. */
const isMemberOf = (memberId: MemberId.MemberId, participation: ThreadParticipation.ThreadParticipation) =>
  ThreadParticipation.Participant.matchOrElse(
    participation.participant,
    { Member: (participant) => participant.memberId === memberId },
    () => false
  )
const isText = ThreadMessage.Content.isAnyOf(["Text"])

/** Derive IDs as the server does when it runs `action`. */
const asRequest = <A, E, R>(action: Action, effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, Request.Current, action)

/** The message `action` posts in `threadId`, as it reads before the server publishes it. */
const message = (
  action: Action,
  threadId: Thread.Thread["id"],
  { text, mentions }: Pick<ThreadMessage.PublishInput, "text" | "mentions">
) =>
  Effect.map(ThreadMessage.newId(threadId), (id) =>
    cases.ThreadMessage.make({
      value: {
        id,
        workspaceId: action.workspaceId,
        threadId,
        author: ThreadMessage.Author.cases.Member.make({ memberId: action.memberId }),
        via: null,
        publishedAt: action.writtenAt,
        content: ThreadMessage.Content.cases.Text.make({ text, mentions, revision: 1, editedAt: null })
      }
    })
  )

/** The task `action` makes of `thread`, as `options` start it. */
const task = (action: Action, thread: Thread.Thread, options: Task.Options) =>
  cases.Task.make({
    value: {
      threadId: thread.id,
      workspaceId: action.workspaceId,
      groupId: thread.groupId,
      ...Task.initial(options),
      createdBy: ThreadMessage.Author.cases.Member.make({ memberId: action.memberId }),
      createdAt: action.writtenAt
    }
  })

/**
 * What the person does in threads: starting one, as a task or not, replying, renaming one, editing or deleting a
 * message, following one again or no longer, and reading one through a position. Following one they
 * never took part in waits for the server, which gives the participation their membership.
 */
export const threads: EffectsOf<typeof ThreadSync.Actions> = {
  ThreadStarted: {
    creates: (input, action) =>
      asRequest(
        action,
        Effect.gen(function* () {
          const threadId = yield* Thread.newId(input.groupId)
          const thread = cases.Thread.make({
            value: {
              id: threadId,
              workspaceId: action.workspaceId,
              groupId: input.groupId,
              title: input.title ?? null,
              origin: input.origin ?? null,
              createdBy: ThreadMessage.Author.cases.Member.make({ memberId: action.memberId }),
              createdAt: action.writtenAt
            }
          })
          const opening = yield* message(action, threadId, input)
          return input.task === undefined
            ? [thread, opening]
            : [thread, opening, task(action, thread.value, input.task)]
        })
      )
  },
  DirectThreadStarted: {
    // A direct group is named by its members, so starting one with the same people reuses it.
    creates: (input, action) =>
      asRequest(
        action,
        Effect.gen(function* () {
          const memberIds = Group.directMembers([action.memberId, ...input.memberIds])
          const groupId = yield* Group.directId(action.workspaceId, memberIds)
          const group = cases.Group.make({
            value: {
              id: groupId,
              workspaceId: action.workspaceId,
              kind: "Direct",
              memberIds,
              createdBy: action.memberId,
              createdAt: action.writtenAt
            }
          })
          const threadId = yield* Thread.newId(groupId)
          const thread = cases.Thread.make({
            value: {
              id: threadId,
              workspaceId: action.workspaceId,
              groupId,
              title: input.title ?? null,
              origin: null,
              createdBy: ThreadMessage.Author.cases.Member.make({ memberId: action.memberId }),
              createdAt: action.writtenAt
            }
          })
          return [group, thread, yield* message(action, threadId, input)]
        })
      )
  },
  ThreadMessagePosted: {
    creates: (input, action) =>
      asRequest(
        action,
        Effect.map(message(action, input.threadId, input), (posted) => [posted])
      )
  },
  ThreadRenamed: {
    changes: ({ threadId, title }, record) =>
      isThread(record) && record.value.id === threadId
        ? cases.Thread.make({ value: { ...record.value, title } })
        : undefined
  },
  ThreadMessageEdited: {
    changes: ({ messageId, text, mentions }, record, action) =>
      isMessage(record) && record.value.id === messageId && isText(record.value.content)
        ? cases.ThreadMessage.make({
            value: {
              ...record.value,
              content: ThreadMessage.Content.cases.Text.make({
                text,
                mentions,
                revision: record.value.content.revision + 1,
                editedAt: action.writtenAt
              })
            }
          })
        : undefined
  },
  ThreadMessageDeleted: {
    changes: ({ messageId }, record, action) =>
      isMessage(record) && record.value.id === messageId
        ? cases.ThreadMessage.make({
            value: {
              ...record.value,
              content: ThreadMessage.Content.cases.Deleted.make({ deletedAt: action.writtenAt })
            }
          })
        : undefined
  },
  ThreadFollowed: {
    changes: ({ threadId }, record, action) =>
      isParticipation(record) &&
      record.value.threadId === threadId &&
      record.value.status === "ended" &&
      isMemberOf(action.memberId, record.value)
        ? cases.ThreadParticipation.make({ value: { ...record.value, status: "active", endedAt: null } })
        : undefined
  },
  ThreadUnfollowed: {
    changes: ({ participationId }, record, action) =>
      isParticipation(record) && record.value.id === participationId && record.value.status === "active"
        ? cases.ThreadParticipation.make({ value: { ...record.value, status: "ended", endedAt: action.writtenAt } })
        : undefined
  },
  ThreadMarkedRead: {
    // Read through a position: the furthest the member read stays.
    creates: ({ threadId, throughSequence }, action) =>
      Effect.succeed([
        cases.ThreadPosition.make({
          value: { workspaceId: action.workspaceId, memberId: action.memberId, threadId, readThrough: throughSequence }
        })
      ]),
    // Reading a thread also settles the member's notifications from it, up to the position.
    changes: ({ threadId, throughSequence }, record, action) =>
      isPosition(record) &&
      record.value.threadId === threadId &&
      record.value.memberId === action.memberId &&
      record.value.readThrough < throughSequence
        ? cases.ThreadPosition.make({ value: { ...record.value, readThrough: throughSequence } })
        : isNotification(record) &&
            NotificationStore.isPendingInThread(record.value, {
              workspaceId: action.workspaceId,
              memberId: action.memberId,
              threadId,
              readThrough: throughSequence
            })
          ? seen(record, action)
          : undefined
  }
}

/** A membership the server gives `memberId` in `groupId` when it runs `action`. */
const membership = (action: Action, groupId: Group.Group["id"], memberId: MemberId.MemberId) =>
  Effect.map(GroupMembership.newId(groupId, memberId), (id) =>
    cases.GroupMembership.make({
      value: { id, workspaceId: action.workspaceId, groupId, memberId, admittedAt: action.writtenAt, status: "active" }
    })
  )

/** `record`, the membership `membershipId` while it is active, as removed. */
const endMembership = (record: ReplicaRecord.ReplicaRecord, membershipId: GroupMembership.GroupMembershipId) =>
  isMembership(record) && record.value.id === membershipId && record.value.status === "active"
    ? cases.GroupMembership.make({ value: { ...record.value, status: "removed" } })
    : undefined

/** `record` as `memberId`'s follow of `groupId`, in `status`, or undefined when it is not theirs or already so. */
const follow = (
  record: ReplicaRecord.ReplicaRecord,
  groupId: Group.Group["id"],
  memberId: MemberId.MemberId,
  status: GroupFollow.GroupFollow["status"],
  at: DateTime.Utc
) =>
  isFollow(record) &&
  record.value.groupId === groupId &&
  record.value.memberId === memberId &&
  record.value.status !== status
    ? cases.GroupFollow.make({ value: { ...record.value, status, endedAt: status === "ended" ? at : null } })
    : undefined

/**
 * What the person does to groups: creating a team, renaming one, admitting a member or joining
 * oneself, ending a membership or leaving, following a group again or no longer, and reading one.
 * Following a group they never followed waits for the server, which gives the follow the admission
 * it is held through.
 */
export const groups: EffectsOf<typeof GroupSync.Actions> = {
  TeamCreated: {
    creates: ({ name, memberIds, visibility }, action) =>
      asRequest(
        action,
        Effect.gen(function* () {
          const id = yield* Group.newId
          const team = cases.Group.make({
            value: {
              id,
              workspaceId: action.workspaceId,
              kind: "Team",
              visibility: visibility ?? "Private",
              name,
              createdBy: action.memberId,
              createdAt: action.writtenAt
            }
          })
          return [team, ...(yield* Effect.forEach(memberIds, (memberId) => membership(action, id, memberId)))]
        })
      )
  },
  GroupRenamed: {
    changes: ({ groupId, name }, record) =>
      isGroup(record) && record.value.id === groupId && "name" in record.value
        ? cases.Group.make({ value: { ...record.value, name } })
        : undefined
  },
  GroupMemberAdded: {
    creates: ({ groupId, memberId }, action) =>
      asRequest(
        action,
        Effect.map(membership(action, groupId, memberId), (admitted) => [admitted])
      )
  },
  GroupJoined: {
    creates: ({ groupId }, action) =>
      asRequest(
        action,
        Effect.map(membership(action, groupId, action.memberId), (admitted) => [admitted])
      )
  },
  GroupMemberRemoved: { changes: ({ membershipId }, record) => endMembership(record, membershipId) },
  GroupLeft: { changes: ({ membershipId }, record) => endMembership(record, membershipId) },
  GroupFollowed: {
    changes: ({ groupId, memberId }, record, action) => follow(record, groupId, memberId, "active", action.writtenAt)
  },
  GroupUnfollowed: {
    changes: ({ groupId, memberId }, record, action) => follow(record, groupId, memberId, "ended", action.writtenAt)
  },
  GroupMarkedRead: {
    creates: ({ groupId }, action) =>
      Effect.succeed([
        cases.GroupRead.make({
          value: { workspaceId: action.workspaceId, memberId: action.memberId, groupId, readAt: action.writtenAt }
        })
      ]),
    changes: ({ groupId }, record, action) =>
      isGroupRead(record) && record.value.groupId === groupId && record.value.memberId === action.memberId
        ? cases.GroupRead.make({ value: { ...record.value, readAt: action.writtenAt } })
        : undefined
  }
}

/** The assignment `action` gives `memberId` of `roleId`, at the workspace's scope, as the server makes it. */
const roleAssignment = (action: Action, memberId: MemberId.MemberId, roleId: Role.RoleId) =>
  asRequest(
    action,
    Effect.map(Assignment.newId(memberId, roleId), (id) =>
      cases.Assignment.make({
        value: Assignment.Assignment.make({
          id,
          workspaceId: action.workspaceId,
          memberId,
          status: "active",
          source: Assignment.Source.cases.Role.make({
            roleId,
            scope: Scope.Scope.cases.Workspace.make({ workspaceId: action.workspaceId })
          })
        })
      })
    )
  )

/** `record`, the assignment `assignmentId` while it is active, as revoked. */
const revokeAssignment = (record: ReplicaRecord.ReplicaRecord, assignmentId: Assignment.AssignmentId) =>
  isAssignment(record) && record.value.id === assignmentId && record.value.status === "active"
    ? cases.Assignment.make({ value: { ...record.value, status: "revoked" } })
    : undefined

/**
 * What the person does to the workspace: renaming it or handing it to another member, renaming
 * themselves, removing a member, revoking an invitation, and giving, replacing, or taking away a
 * member's roles. An invitation names its recipient by address, whose account only the server
 * knows, so issuing one waits for the server. Handing the workspace over changes its owner at once,
 * and the roles that go with it when the server's changes arrive.
 */
export const workspace: EffectsOf<typeof WorkspaceSync.Actions> = {
  WorkspaceRenamed: {
    changes: ({ name }, record) =>
      isWorkspace(record) ? cases.Workspace.make({ value: { ...record.value, name } }) : undefined
  },
  OwnershipTransferred: {
    changes: ({ memberId }, record) =>
      isWorkspace(record) ? cases.Workspace.make({ value: { ...record.value, ownerMemberId: memberId } }) : undefined
  },
  MemberRenamed: {
    changes: ({ name }, record, action) =>
      isMember(record) && record.value.id === action.memberId
        ? cases.Member.make({ value: { ...record.value, name } })
        : undefined
  },
  MemberRemoved: {
    changes: ({ memberId }, record) =>
      isMember(record) && record.value.id === memberId && record.value.status === "active"
        ? cases.Member.make({ value: { ...record.value, status: "removed" } })
        : undefined
  },
  InvitationRevoked: {
    changes: ({ invitationId }, record, action) =>
      isInvitation(record) &&
      record.value.details.id === invitationId &&
      Invitation.State.isAnyOf(["Pending"])(record.value.state)
        ? cases.Invitation.make({
            value: {
              ...record.value,
              state: Invitation.State.cases.Revoked.make({ revokedBy: action.memberId, revokedAt: action.writtenAt })
            }
          })
        : undefined
  },
  RoleAssigned: {
    creates: ({ memberId, roleId }, action) => Effect.map(roleAssignment(action, memberId, roleId), (made) => [made])
  },
  RolesReplaced: {
    creates: ({ memberId, roleId }, action) => Effect.map(roleAssignment(action, memberId, roleId), (made) => [made]),
    changes: ({ expectedAssignmentIds }, record) =>
      isAssignment(record) && expectedAssignmentIds.includes(record.value.id)
        ? revokeAssignment(record, record.value.id)
        : undefined
  },
  AssignmentRevoked: { changes: ({ assignmentId }, record) => revokeAssignment(record, assignmentId) }
}

/** What the person does with their notifications: seeing one, or every one up to a point. */
export const notifications: EffectsOf<typeof NotificationSync.Actions> = {
  NotificationSeen: {
    changes: ({ notificationId }, record, action) =>
      isOwnPending(record, action) && record.value.id === notificationId ? seen(record, action) : undefined
  },
  NotificationsSeenThrough: {
    changes: ({ through }, record, action) =>
      isOwnPending(record, action) && NotificationStore.isAtOrBefore(record.value, through)
        ? seen(record, action)
        : undefined
  }
}

/**
 * What the person does with a thread's task: making the thread a task, from the thread as they see
 * it, and changing one from the value they saw, which a task changed meanwhile keeps, as the server
 * refuses it.
 */
export const tasks: EffectsOf<typeof TaskSync.Actions> = {
  TaskCreated: {
    creates: ({ threadId, ...options }, action, find) =>
      Effect.map(find(ReplicaRecord.Key.cases.Thread.make({ id: threadId })), (thread) =>
        Option.match(thread, { onNone: () => [], onSome: ({ value }) => [task(action, value, options)] })
      )
  },
  TaskUpdated: {
    changes: ({ threadId, change }, record) =>
      isTask(record) && record.value.threadId === threadId && Task.valueOf(record.value, change) === change.from
        ? cases.Task.make({ value: Task.apply(record.value, change) })
        : undefined
  }
}

/**
 * What the person does with agents' turns: asking one to stop, which stops a queued turn at once
 * and asks a running one to, and running one again, as a queued turn under the ID its retry has.
 */
export const turns: EffectsOf<typeof TurnSync.Actions> = {
  TurnCancelRequested: {
    changes: ({ turnId }, record, action) =>
      isTurn(record) && record.value.id === turnId && Turn.stoppable(record.value.status)
        ? cases.Turn.make({
            value:
              record.value.status === "queued"
                ? { ...record.value, status: "cancelled", cancelReason: "requested", finishedAt: action.writtenAt }
                : { ...record.value, status: "cancelling", cancelReason: "requested" }
          })
        : undefined
  },
  TurnRetried: {
    creates: ({ turnId }, action, find) =>
      Effect.gen(function* () {
        const found = yield* find(ReplicaRecord.Key.cases.Turn.make({ id: turnId }))
        if (Option.isNone(found)) return []
        const retried = Turn.queued({
          ...found.value.value,
          id: yield* Turn.retryId(action.workspaceId, turnId),
          retry: { of: turnId, by: action.memberId },
          logAfter: null,
          createdAt: action.writtenAt
        })
        return [cases.Turn.make({ value: Struct.omit(retried, ["logAfter"]) })]
      })
  }
}

/**
 * What the person does with the workspace's connections: renaming one from the name they saw, which
 * a rename made meanwhile keeps, as the server refuses it; replacing its settings; and removing it.
 * How ready a connection is stays as the server last found it, since only the server can tell.
 */
export const connections: EffectsOf<typeof ConnectionSync.Actions> = {
  ConnectionRenamed: {
    changes: ({ connectionId, name, expectedName }, record) =>
      isConnection(record) && record.value.id === connectionId && record.value.name === expectedName
        ? cases.Connection.make({ value: { ...record.value, name } })
        : undefined
  },
  ConnectionConfigured: {
    changes: ({ connectionId, settings }, record) =>
      isConnection(record) && record.value.id === connectionId
        ? cases.Connection.make({ value: { ...record.value, settings } })
        : undefined
  },
  ConnectionRemoved: {
    changes: ({ connectionId }, record) =>
      isConnection(record) && record.value.id === connectionId && record.value.status === "active"
        ? cases.Connection.make({ value: { ...record.value, status: "removed" } })
        : undefined
  }
}

const effectsByTag = {
  ...threads,
  ...groups,
  ...workspace,
  ...notifications,
  ...tasks,
  ...turns,
  ...connections
} as Readonly<Record<string, Effects<unknown> | undefined>>

/** What the action `tag` does, if anything, before the server's changes arrive. */
export const effectsOf = (tag: string): Effects<unknown> => effectsByTag[tag] ?? {}

const events = SyncSchema.SyncSchema.groups.flatMap((group) =>
  Object.values((group as EventGroup.EventGroup<Event.Any>).events)
)

/** An action's payload, decoded by its event, or undefined for one that no longer decodes. */
export const decodePayload = (tag: string, payload: Uint8Array): Effect.Effect<unknown> => {
  const event = events.find((candidate) => candidate.tag === tag)
  if (event === undefined) return Effect.void
  return Effect.orElseSucceed(
    Schema.decodeEffect(event.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>)(payload),
    () => undefined
  )
}

/** An action the server has not finished nor refused, as it applies to the replica. */
export interface Unfinished {
  readonly action: Action
  readonly payload: unknown
  readonly effects: Effects<unknown>
  readonly creates: ReadonlyArray<ReplicaRecord.ReplicaRecord>
}

/** The actions the replica holds that still apply, in the order they were written, as `author` wrote them. */
export const unfinished = (
  actions: ReadonlyArray<Replica.Action>,
  author: Pick<Action, "workspaceId" | "memberId">
): Effect.Effect<ReadonlyArray<Unfinished>> =>
  Effect.forEach(
    actions
      .filter(({ rejection }) => Option.isNone(rejection))
      .toSorted((left, right) => (left.key < right.key ? -1 : 1)),
    (held) =>
      Effect.map(decodePayload(held.tag, held.payload), (payload) => ({
        action: { ...author, key: Request.Key.make(held.key), writtenAt: held.writtenAt },
        payload,
        // One that no longer decodes changes nothing.
        effects: payload === undefined ? {} : effectsOf(held.tag),
        creates: held.creates
      }))
  )

/** A record as the person sees it, and whether an action of theirs not yet finished made it so. */
export interface Held<Record extends ReplicaRecord.ReplicaRecord = ReplicaRecord.ReplicaRecord> {
  readonly record: Record
  readonly pending: boolean
}

const samePlace = Schema.toEquivalence(ReplicaRecord.Place)
const sameKey = Schema.toEquivalence(ReplicaRecord.Key)

/**
 * `records`, the server's of `kind` at `place`, or anywhere without one, as `pending` leaves them:
 * each action changes what the ones before it left, then adds what it creates there that the server
 * does not hold yet.
 */
export const overlay = <Kind extends ReplicaRecord.Kind>(
  kind: Kind,
  place: ReplicaRecord.Place | undefined,
  records: ReadonlyArray<Replica.RecordOf<Kind>>,
  pending: ReadonlyArray<Unfinished>
): ReadonlyArray<Held<Replica.RecordOf<Kind>>> => {
  const isKind = ReplicaRecord.ReplicaRecord.isAnyOf([kind])
  let held: ReadonlyArray<Held<Replica.RecordOf<Kind>>> = records.map((record) => ({ record, pending: false }))
  for (const { action, payload, effects, creates } of pending) {
    const { changes } = effects
    if (changes !== undefined)
      held = held.map((current) => {
        const changed = changes(payload, current.record, action)
        return changed !== undefined && isKind(changed) ? { record: changed, pending: true } : current
      })
    for (const created of creates) {
      if (!isKind(created) || (place !== undefined && !samePlace(ReplicaRecord.placeOf(created), place))) continue
      const key = ReplicaRecord.keyOf(created)
      if (!held.some(({ record }) => sameKey(ReplicaRecord.keyOf(record), key)))
        held = [...held, { record: created, pending: true }]
    }
  }
  return held
}

/**
 * The record under `key` as the person sees it: the server's, `record`, as `pending` leaves it, or
 * one an unfinished action creates.
 */
export const find = <Kind extends ReplicaRecord.Kind>(
  key: Replica.KeyOf<Kind>,
  record: Option.Option<Replica.RecordOf<Kind>>,
  pending: ReadonlyArray<Unfinished>
): Option.Option<Replica.RecordOf<Kind>> =>
  Option.map(
    Array.findFirst(overlay(key._tag as Kind, undefined, Option.toArray(record), pending), (held) =>
      sameKey(ReplicaRecord.keyOf(held.record), key)
    ),
    (held) => held.record
  )

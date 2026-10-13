import {
  Group,
  GroupFacts,
  GroupFollow,
  GroupFollowFacts,
  GroupMembership,
  GroupMembershipFacts,
  GroupMembershipStore,
  GroupPermissions
} from "@amends-dev/core/group"
import { Subject } from "@amends-dev/core/journal"
import {
  Thread,
  ThreadFacts,
  ThreadMessage,
  ThreadMessageFacts,
  ThreadParticipation,
  ThreadParticipationFacts,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadActivityKind,
  ThreadMessageActivity,
  ThreadPermissions
} from "@amends-dev/core/thread"
import { expect, it } from "@effect/vitest"
import { DateTime, Effect, Exit, Fiber, Layer, Option, Queue, Schema, type Scope, Stream } from "effect"
import * as Assignment from "../../src/authorization/Assignment.ts"
import * as AssignmentFacts from "../../src/authorization/AssignmentFacts.ts"
import * as AssignmentPermissions from "../../src/authorization/AssignmentPermissions.ts"
import * as AssignmentStore from "../../src/authorization/AssignmentStore.ts"
import * as Authorization from "../../src/authorization/Authorization.ts"
import * as GrantResolver from "../../src/authorization/GrantResolver.ts"
import type * as Permission from "../../src/authorization/Permission.ts"
import * as PermissionCatalog from "../../src/authorization/PermissionCatalog.ts"
import * as Role from "../../src/authorization/Role.ts"
import * as RoleFacts from "../../src/authorization/RoleFacts.ts"
import * as RoleStore from "../../src/authorization/RoleStore.ts"
import * as GrantScope from "../../src/authorization/Scope.ts"
import * as ChangeFeed from "../../src/change-feed/ChangeFeed.ts"
import * as ChangeFeedService from "../../src/change-feed/ChangeFeedService.ts"
import * as ChangeFeedSource from "../../src/change-feed/ChangeFeedSource.ts"
import * as CoreError from "../../src/error/CoreError.ts"
import * as Actor from "../../src/identity/Actor.ts"
import * as Identity from "../../src/identity/Identity.ts"
import * as Checkpoint from "../../src/journal/Checkpoint.ts"
import * as Entry from "../../src/journal/Entry.ts"
import * as Fact from "../../src/journal/Fact.ts"
import * as Journal from "../../src/journal/Journal.ts"
import * as Log from "../../src/journal/Log.ts"
import * as Publication from "../../src/journal/Publication.ts"
import * as Store from "../../src/journal/Store.ts"
import * as Notification from "../../src/notification/Notification.ts"
import * as Signal from "../../src/signal/Signal.ts"
import * as SignalHub from "../../src/signal/SignalHub.ts"
import * as Invitation from "../../src/workspace/Invitation.ts"
import * as InvitationFacts from "../../src/workspace/InvitationFacts.ts"
import * as InvitationPermissions from "../../src/workspace/InvitationPermissions.ts"
import * as Member from "../../src/workspace/Member.ts"
import * as MemberFacts from "../../src/workspace/MemberFacts.ts"
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts"
import * as MemberStore from "../../src/workspace/MemberStore.ts"
import * as Workspace from "../../src/workspace/Workspace.ts"
import * as WorkspaceFacts from "../../src/workspace/WorkspaceFacts.ts"
import { make, type Fixture } from "../memory.ts"
import { testProvenance } from "../publication.ts"
import * as TestSignalHub from "../signal-hub.ts"

const workspaceId = Workspace.Id.make("workspace-one")
const at = DateTime.makeUnsafe("2026-09-20T12:00:00.123Z")
const alice: Identity.MemberReference = { _tag: "Human", id: Identity.HumanId.make("alice") }
const actor = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("alice-member"),
  identity: alice
})
const bobMember = Member.Id.make("bob-member")
const groupId = Group.Id.make("group")
const otherGroupId = Group.Id.make("other-group")
const threadId = Thread.Id.make("thread")
const otherThreadId = Thread.Id.make("other-thread")

const invitation = (id: string): Invitation.Issuance => ({
  id: Invitation.Id.make(id),
  workspaceId,
  inviterMemberId: actor.memberId,
  recipientId: Identity.HumanId.make("bob"),
  roleId: Role.Id.make("viewer"),
  issuedAt: at,
  expiresAt: DateTime.makeUnsafe("2026-09-21T12:00:00.456Z")
})
const group = (id: Group.Id) => ({
  id,
  workspaceId,
  kind: "Team" as const,
  visibility: "Private" as const,
  name: "Private name",
  createdBy: actor.memberId,
  createdAt: at
})
const admission = (group: Group.Id, memberId = actor.memberId) => ({
  id: GroupMembership.Id.make(`${group}:${memberId}`),
  workspaceId,
  groupId: group,
  memberId,
  admittedAt: at,
  status: "active" as const
})
const thread = (id: Thread.Id, group: Group.Id) => ({
  id,
  workspaceId,
  groupId: group,
  title: null,
  origin: null,
  createdBy: { _tag: "Member" as const, memberId: bobMember },
  createdAt: at
})
const message = (id: string, thread: Thread.Id, group: Group.Id) => ({
  id: ThreadMessage.Id.make(id),
  workspaceId,
  groupId: group,
  threadId: thread,
  author: { _tag: "Member" as const, memberId: bobMember },
  via: null,
  publishedAt: at,
  content: ThreadMessage.published(`Message ${id}`, [])
})
const workspaceGrant = (permission: Permission.Definition) =>
  Assignment.Source.cases.Direct.make({
    grant: {
      permission: permission.name,
      scope: GrantScope.Scope.cases.Workspace.make({ workspaceId })
    }
  })
const threadGrant = (id: Thread.Id) =>
  Assignment.Source.cases.Direct.make({
    grant: {
      permission: ThreadPermissions.Read.name,
      scope: GrantScope.Scope.cases.Target.make({
        target: { _tag: "Thread", workspaceId, threadId: id }
      })
    }
  })
const Internal = Fact.make("test.internal", {
  version: 1,
  payload: Schema.String,
  subject: () => Subject.make("test", "entity")
})

interface Options {
  readonly source?: ChangeFeedSource.Options
  /**
   * The actor's grants; by default thread, group, and member reads and invitation management
   * across the workspace, so every delivered fact reaches them.
   */
  readonly grants?: ReadonlyArray<Assignment.Source>
}
interface World {
  readonly fixture: Fixture
  /** The groups the actor currently belongs to, as the membership projection would report. */
  readonly admitted: Set<Group.Id>
  /** Run a program once, just after the next read of the reader's workspace membership. */
  readonly afterMemberRead: (program: Effect.Effect<void>) => void
  /** Run a program once, just after the next read of the reader's group admissions. */
  readonly afterAccessRead: (program: Effect.Effect<void>) => void
}

/** A program that runs once after a store read, as a commit racing that read would. */
const racing = () => {
  let pending: Effect.Effect<void> | undefined
  return {
    set: (program: Effect.Effect<void>) => {
      pending = program
    },
    after: <A, E>(read: Effect.Effect<A, E>) =>
      Effect.tap(read, () =>
        Effect.suspend(() => {
          const program = pending ?? Effect.void
          pending = undefined
          return program
        })
      )
  }
}
type Services = ChangeFeedService.ChangeFeedService | Journal.Journal | SignalHub.SignalHub | Actor.Actor | Scope.Scope

const run = <A, E>(use: (world: World) => Effect.Effect<A, E, Services>, options: Options = {}) =>
  Effect.gen(function* () {
    const fixture = yield* make(workspaceId)
    const grants = options.grants ?? [
      workspaceGrant(ThreadPermissions.Read),
      workspaceGrant(GroupPermissions.Read),
      workspaceGrant(MemberPermissions.Read),
      workspaceGrant(InvitationPermissions.Manage)
    ]
    yield* fixture.store.transaction(
      Effect.gen(function* () {
        yield* fixture.members.insert({
          id: actor.memberId,
          workspaceId,
          identity: actor.identity,
          name: Member.Name.make("alice"),
          status: "active"
        })
        for (const [index, source] of grants.entries())
          yield* fixture.assignments.insert({
            id: Assignment.Id.make(`grant-${index}`),
            workspaceId,
            memberId: actor.memberId,
            source,
            status: "active"
          })
      })
    )
    const admitted = new Set<Group.Id>()
    const memberRead = racing()
    const accessRead = racing()
    const members = fixture.members
    const unexpected = () => Effect.die(new Error("Unexpected membership store use"))
    const memberships = GroupMembershipStore.GroupMembershipStore.of({
      get: unexpected,
      getMany: unexpected,
      findActive: unexpected,
      listByGroup: unexpected,
      findActiveMany: unexpected,
      summarize: unexpected,
      pageActiveByGroup: unexpected,
      pageActiveByMember: unexpected,
      listActiveByMember: (memberId) =>
        accessRead.after(
          Effect.sync(() => (memberId === actor.memberId ? [...admitted].map((id) => admission(id)) : []))
        ),
      insert: unexpected,
      markRemoved: unexpected
    })
    const host = Layer.mergeAll(
      Layer.succeed(Store.Store, fixture.store),
      Layer.succeed(Checkpoint.Checkpoint, fixture.checkpoints),
      Layer.succeed(
        MemberStore.MemberStore,
        Object.assign({}, members, { get: (id: Member.Id) => memberRead.after(members.get(id)) })
      ),
      Layer.succeed(RoleStore.RoleStore, fixture.roles),
      Layer.succeed(AssignmentStore.AssignmentStore, fixture.assignments),
      Layer.succeed(GroupMembershipStore.GroupMembershipStore, memberships),
      TestSignalHub.layer,
      PermissionCatalog.layer([
        ThreadPermissions.Read,
        GroupPermissions.Read,
        MemberPermissions.Read,
        InvitationPermissions.Manage,
        AssignmentPermissions.Read
      ])
    )
    const services = Layer.mergeAll(
      Journal.layer({ logId: Entry.LogId.make("journal"), projections: [] }).pipe(Layer.provide(Log.layer)),
      Authorization.layer.pipe(Layer.provide(GrantResolver.layer)),
      GrantResolver.layer
    ).pipe(Layer.provideMerge(host))
    const configured = ChangeFeedService.layer.pipe(
      Layer.provide(ChangeFeedSource.layer(options.source)),
      Layer.provideMerge(services)
    )
    return yield* use({
      fixture,
      admitted,
      afterMemberRead: memberRead.set,
      afterAccessRead: accessRead.set
    }).pipe(Effect.provide(configured), Effect.provideService(Actor.Actor, actor))
  }).pipe(Effect.scoped)

/** Publish facts in one commit with trusted test attribution. */
const commit = (program: Effect.Effect<unknown, unknown, Journal.Journal | Publication.Publication>) =>
  Effect.flatMap(Journal.Journal, (journal) =>
    journal
      .commit(program)
      .pipe(
        Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
        Effect.provideService(Journal.Journal, journal)
      )
  ).pipe(Effect.orDie)
const publish = <F extends Fact.Definition>(fact: F, payload: Fact.Payload<NoInfer<F>>) =>
  Effect.flatMap(Journal.Journal, (journal) => journal.publish(fact, payload))

/** Open a subscription and buffer its messages; the stream's end shows in its fiber. */
const listen = Effect.fnUntraced(function* (options?: ChangeFeed.WatchOptions) {
  const stream = yield* (yield* ChangeFeedService.ChangeFeedService).watch(options)
  const queue = yield* Queue.unbounded<ChangeFeed.Message>()
  const fiber = yield* stream.pipe(
    Stream.runForEach((message) => Queue.offer(queue, message)),
    Effect.forkScoped
  )
  return { next: Queue.take(queue), fiber, queue }
})
const committed = (message: ChangeFeed.Message) => {
  if (!ChangeFeed.Message.isAnyOf(["Committed"])(message)) throw new Error(`Expected a commit, got ${message._tag}`)
  return message
}
const signal = (value: Signal.Signal) => Effect.flatMap(SignalHub.SignalHub, (signalHub) => signalHub.publish(value))
const typing = (thread: Thread.Id, group: Group.Id, memberId = bobMember) =>
  Signal.Signal.cases.Typing.make({
    workspaceId,
    groupId: group,
    threadId: thread,
    memberId,
    until: at
  })
const groupRead = (memberId: Member.Id, group = groupId) =>
  Signal.Signal.cases.GroupRead.make({ workspaceId, memberId, groupId: group, readAt: at })
const sameSignal = Schema.toEquivalence(Signal.Signal)
/** The signals delivered before a marker the reader is known to receive. */
const signalsUntil = Effect.fnUntraced(function* (next: Effect.Effect<ChangeFeed.Message>, marker: Signal.Signal) {
  yield* signal(marker)
  const received: Array<Signal.Signal> = []
  for (;;) {
    const message = yield* next
    if (!ChangeFeed.Message.isAnyOf(["Signal"])(message)) throw new Error(`Expected a signal, got ${message._tag}`)
    if (sameSignal(message.signal, marker)) return received
    received.push(message.signal)
  }
})

it.effect("a subscription without a cursor resets at the head, then delivers later commits", () =>
  run(() =>
    Effect.gen(function* () {
      yield* commit(publish(InvitationFacts.Issued, invitation("before")))
      const feed = yield* listen()
      const ready = yield* feed.next
      expect(ready).toEqual({ _tag: "Ready", workspaceId, cursor: "0", reset: true })
      yield* commit(publish(InvitationFacts.Issued, invitation("after")))
      const received = committed(yield* feed.next)
      expect(received.cursor).toBe("1")
      expect(received.events.map((event) => event.name)).toEqual([InvitationFacts.Issued.name])
      expect(received.events[0]?.payload).toMatchObject({
        id: "after",
        issuedAt: "2026-09-20T12:00:00.123Z"
      })
      expect(yield* Queue.size(feed.queue)).toBe(0)
    })
  )
)

it.effect("an empty journal reports no cursor, and the first commit carries one", () =>
  run(() =>
    Effect.gen(function* () {
      const feed = yield* listen()
      expect(yield* feed.next).toEqual({ _tag: "Ready", workspaceId, cursor: null, reset: true })
      yield* commit(publish(InvitationFacts.Issued, invitation("first")))
      expect(committed(yield* feed.next).cursor).toBe("0")
    })
  )
)

it.effect("a cursor resumes after its commit without a reset, replaying what followed", () =>
  run(() =>
    Effect.gen(function* () {
      const cursor = yield* Effect.scoped(
        Effect.gen(function* () {
          const feed = yield* listen()
          yield* feed.next
          yield* commit(publish(InvitationFacts.Issued, invitation("seen")))
          return committed(yield* feed.next).cursor
        })
      )
      yield* commit(publish(InvitationFacts.Issued, invitation("missed-1")))
      yield* commit(publish(Internal, "not delivered"))
      yield* commit(publish(InvitationFacts.Issued, invitation("missed-2")))
      const feed = yield* listen({ after: cursor })
      expect(yield* feed.next).toEqual({ _tag: "Ready", workspaceId, cursor, reset: false })
      const replayed = [committed(yield* feed.next), committed(yield* feed.next)]
      expect(replayed.map((m) => m.events[0]?.payload)).toMatchObject([{ id: "missed-1" }, { id: "missed-2" }])
      expect(replayed.map((m) => m.cursor)).toEqual(["1", "3"])
      yield* commit(publish(InvitationFacts.Issued, invitation("live")))
      expect(committed(yield* feed.next).events[0]?.payload).toMatchObject({ id: "live" })
      // Resuming at the head replays nothing and still needs no reset.
      const current = yield* listen({ after: ChangeFeed.Cursor.make("4") })
      expect(yield* current.next).toMatchObject({ reset: false, cursor: "4" })
    })
  )
)

it.effect("a cursor past the head, or further behind than the replay limit, resets", () =>
  run(
    () =>
      Effect.gen(function* () {
        for (const id of ["a", "b", "c", "d"]) yield* commit(publish(InvitationFacts.Issued, invitation(id)))
        const unknown = yield* listen({ after: ChangeFeed.Cursor.make("99") })
        expect(yield* unknown.next).toEqual({
          _tag: "Ready",
          workspaceId,
          cursor: "3",
          reset: true
        })
        const behind = yield* listen({ after: ChangeFeed.Cursor.make("0") })
        expect(yield* behind.next).toMatchObject({ cursor: "3", reset: true })
        const within = yield* listen({ after: ChangeFeed.Cursor.make("1") })
        expect(yield* within.next).toMatchObject({ cursor: "1", reset: false })
        expect(committed(yield* within.next).cursor).toBe("2")
        expect(committed(yield* within.next).cursor).toBe("3")
        yield* commit(publish(InvitationFacts.Issued, invitation("e")))
        for (const feed of [unknown, behind, within]) expect(committed(yield* feed.next).cursor).toBe("4")
      }),
    { source: { capacity: 256, replayLimit: 2, pageSize: 1 } }
  )
)

it.effect("invalid cursors are rejected before subscribing", () =>
  run(() =>
    Effect.gen(function* () {
      const changeFeedService = yield* ChangeFeedService.ChangeFeedService
      for (const after of ["-1", "01", "1.5", "x", "9007199254740993"]) {
        const error = yield* Effect.flip(changeFeedService.watch({ after: after as ChangeFeed.Cursor }))
        expect(error).toMatchObject({ _tag: "CoreError.Invalid", reason: { _tag: "Malformed" } })
      }
    })
  )
)

it.effect("group and thread events reach the group's readers, and admission reloads the reader's scopes", () =>
  run(({ admitted }) =>
    Effect.gen(function* () {
      const feed = yield* listen()
      yield* feed.next
      // Not yet a member: the group's thread and messages are withheld.
      yield* commit(
        Effect.gen(function* () {
          yield* publish(GroupFacts.Created, group(groupId))
          yield* publish(ThreadFacts.Created, thread(threadId, groupId))
          yield* publish(ThreadMessageFacts.Published, message("hidden", threadId, groupId))
        })
      )
      // The projection admits the reader in the same commit that records the admission.
      admitted.add(groupId)
      yield* commit(
        Effect.gen(function* () {
          yield* publish(GroupMembershipFacts.Added, admission(groupId))
          yield* publish(ThreadMessageFacts.Published, message("visible", threadId, groupId))
        })
      )
      const joined = committed(yield* feed.next)
      expect(joined.cursor).toBe("1")
      expect(joined.events.map((e) => e.name)).toEqual([
        GroupMembershipFacts.Added.name,
        ThreadMessageFacts.Published.name
      ])
      // Another group's activity stays withheld.
      yield* commit(publish(ThreadMessageFacts.Published, message("elsewhere", otherThreadId, otherGroupId)))
      admitted.delete(groupId)
      yield* commit(
        Effect.gen(function* () {
          yield* publish(GroupMembershipFacts.Removed, {
            groupId,
            membershipId: admission(groupId).id,
            workspaceId,
            memberId: actor.memberId,
            reason: "removed"
          })
          yield* publish(ThreadMessageFacts.Published, message("after", threadId, groupId))
        })
      )
      // The removed reader learns of their removal, and nothing after it.
      const left = committed(yield* feed.next)
      expect(left.cursor).toBe("3")
      expect(left.events.map((e) => e.name)).toEqual([GroupMembershipFacts.Removed.name])
      yield* commit(publish(InvitationFacts.Issued, invitation("marker")))
      expect(committed(yield* feed.next).events[0]?.name).toBe(InvitationFacts.Issued.name)
    })
  )
)

it.effect("thread events also need the reader's thread.read grant for that thread", () =>
  run(
    ({ admitted }) =>
      Effect.gen(function* () {
        admitted.add(groupId)
        const feed = yield* listen()
        yield* feed.next
        yield* commit(
          Effect.gen(function* () {
            yield* publish(ThreadMessageFacts.Published, message("granted", threadId, groupId))
            yield* publish(ThreadMessageFacts.Published, message("ungranted", otherThreadId, groupId))
          })
        )
        const received = committed(yield* feed.next)
        expect(received.events.map((e) => e.payload)).toMatchObject([{ id: "granted" }])
      }),
    { grants: [threadGrant(threadId)] }
  )
)

it.effect("follows reach only their owner, and thread views hide recipients and routing", () =>
  run(({ admitted }) =>
    Effect.gen(function* () {
      admitted.add(groupId)
      const feed = yield* listen()
      yield* feed.next
      const follow = (memberId: Member.Id) => ({
        id: GroupFollow.Id.make(`follow-${memberId}`),
        workspaceId,
        groupId,
        memberId,
        groupMembershipId: admission(groupId, memberId).id,
        followedAt: at,
        status: "active" as const,
        endedAt: null
      })
      const bob: Identity.MemberReference = { _tag: "Human", id: Identity.HumanId.make("bob") }
      yield* commit(
        Effect.gen(function* () {
          yield* publish(GroupFollowFacts.Started, follow(bobMember))
          yield* publish(GroupFollowFacts.Started, follow(actor.memberId))
          yield* publish(ThreadParticipationFacts.Added, {
            id: ThreadParticipation.Id.make("participation"),
            workspaceId,
            groupId,
            threadId,
            participant: {
              _tag: "Member",
              memberId: bobMember,
              groupMembershipId: admission(groupId, bobMember).id,
              identity: bob
            },
            joinedAt: at,
            joinedAtSequence: 1,
            status: "active",
            endedAt: null
          })
          yield* publish(ThreadActivityFacts.Recorded, {
            groupId,
            activity: ThreadActivityKind.makeRecordUnsafe(
              ThreadMessageActivity.Published,
              {
                id: ThreadActivity.Id.make("activity"),
                workspaceId,
                threadId,
                sequence: 1,
                occurredAt: at
              },
              { messageId: ThreadMessage.Id.make("message") }
            ),
            recipients: [
              {
                participationId: ThreadParticipation.Id.make("participation"),
                recipient: Notification.ofMember(bobMember, bob),
                requestsWork: false
              }
            ]
          })
        })
      )
      const received = committed(yield* feed.next)
      expect(received.events.map((e) => [e.name, e.payload])).toEqual([
        [GroupFollowFacts.Started.name, expect.objectContaining({ memberId: actor.memberId })],
        [
          ThreadParticipationFacts.Added.name,
          {
            id: "participation",
            workspaceId,
            groupId,
            threadId,
            participant: { _tag: "Member", memberId: bobMember },
            joinedAt: "2026-09-20T12:00:00.123Z",
            joinedAtSequence: 1
          }
        ],
        [
          ThreadActivityFacts.Recorded.name,
          {
            groupId,
            activity: {
              id: "activity",
              workspaceId,
              threadId,
              sequence: 1,
              kind: "message.published",
              version: 1,
              subject: "message:message",
              occurrence: JSON.stringify(["message.published", "message:message"]),
              newActivity: true,
              details: { messageId: "message" },
              occurredAt: "2026-09-20T12:00:00.123Z"
            }
          }
        ]
      ])
    })
  )
)

/** Activity in the group that selects Alice and Bob as recipients. */
const notifying = publish(ThreadActivityFacts.Recorded, {
  groupId,
  activity: ThreadActivityKind.makeRecordUnsafe(
    ThreadMessageActivity.Published,
    {
      id: ThreadActivity.Id.make("reply-activity"),
      workspaceId,
      threadId,
      sequence: 3,
      occurredAt: at
    },
    { messageId: ThreadMessage.Id.make("reply") }
  ),
  recipients: [
    {
      participationId: ThreadParticipation.Id.make("alice-participation"),
      recipient: Notification.ofMember(actor.memberId, alice),
      requestsWork: false
    },
    {
      participationId: ThreadParticipation.Id.make("bob-participation"),
      recipient: Notification.ofMember(bobMember, {
        _tag: "Human",
        id: Identity.HumanId.make("bob")
      }),
      requestsWork: false
    },
    {
      participationId: ThreadParticipation.Id.make("triage"),
      recipient: { _tag: "Triage" },
      requestsWork: false
    }
  ]
})

it.effect("the notifications a commit creates reach their recipient alone, with the activity", () =>
  run(({ admitted }) =>
    Effect.gen(function* () {
      admitted.add(groupId)
      const feed = yield* listen()
      yield* feed.next
      yield* commit(notifying)
      const received = committed(yield* feed.next)
      const [activity] = received.events
      expect(activity?.name).toBe(ThreadActivityFacts.Recorded.name)
      expect(received.notifications).toEqual([
        {
          id: JSON.stringify(["journal", activity?.id, "alice-participation"]),
          workspaceId,
          source: { logId: "journal", entryId: activity?.id },
          participationId: "alice-participation",
          thread: { threadId, groupId, sequence: 3 },
          recipient: Notification.ofMember(actor.memberId, alice),
          recordedAt: activity?.recordedAt,
          state: { _tag: "Pending" }
        }
      ])
    })
  )
)

it.effect("a recipient without read access still receives their notification alone", () =>
  run(
    () =>
      Effect.gen(function* () {
        const feed = yield* listen()
        yield* feed.next
        yield* commit(notifying)
        const received = committed(yield* feed.next)
        expect(received.events).toEqual([])
        expect(received.notifications.map((n) => n.participationId)).toEqual(["alice-participation"])
      }),
    { grants: [] }
  )
)

it.effect("internal facts are skipped, and a commit of only internal facts sends nothing", () =>
  run(() =>
    Effect.gen(function* () {
      const feed = yield* listen()
      yield* feed.next
      yield* commit(publish(Internal, "private"))
      yield* commit(
        Effect.gen(function* () {
          yield* publish(Internal, "private")
          yield* publish(InvitationFacts.Issued, invitation("public"))
        })
      )
      const received = committed(yield* feed.next)
      expect(received.cursor).toBe("1")
      expect(received.events.map((e) => e.name)).toEqual([InvitationFacts.Issued.name])
    })
  )
)

it.effect("typing reaches the thread's readers, and private read state reaches its member alone", () =>
  run(
    ({ admitted }) =>
      Effect.gen(function* () {
        admitted.add(groupId)
        const feed = yield* listen()
        yield* feed.next
        const readThread = Signal.Signal.cases.ThreadRead.make({
          workspaceId,
          memberId: actor.memberId,
          threadId,
          readThrough: 3
        })
        const seen = Signal.Signal.cases.NotificationsSeen.make({
          workspaceId,
          memberId: bobMember,
          notificationIds: [Notification.Id.make("notification")]
        })
        yield* signal(typing(threadId, groupId))
        // Withheld: a thread the reader may not read, and a group they do not belong to.
        yield* signal(typing(otherThreadId, groupId))
        yield* signal(typing(threadId, otherGroupId))
        yield* signal(readThread)
        // Another member's private state stays with them.
        yield* signal(Object.assign({}, readThread, { memberId: bobMember }))
        yield* signal(seen)
        yield* signal(groupRead(bobMember))
        const received = yield* signalsUntil(feed.next, groupRead(actor.memberId))
        expect(received).toEqual([typing(threadId, groupId), readThread])
        expect(yield* Queue.size(feed.queue)).toBe(0)
      }),
    { grants: [threadGrant(threadId)] }
  )
)

it.effect("signals follow the reader's access as commits change it, and are never replayed", () =>
  run(({ admitted }) =>
    Effect.gen(function* () {
      const early = yield* listen()
      yield* early.next
      yield* signal(typing(threadId, groupId))
      expect(yield* signalsUntil(early.next, groupRead(actor.memberId))).toEqual([])
      admitted.add(groupId)
      yield* commit(publish(GroupMembershipFacts.Added, admission(groupId)))
      expect(committed(yield* early.next).cursor).toBe("0")
      yield* signal(typing(threadId, groupId))
      expect(yield* signalsUntil(early.next, groupRead(actor.memberId))).toEqual([typing(threadId, groupId)])
      admitted.delete(groupId)
      yield* commit(
        publish(GroupMembershipFacts.Removed, {
          groupId,
          membershipId: admission(groupId).id,
          workspaceId,
          memberId: actor.memberId,
          reason: "removed"
        })
      )
      expect(committed(yield* early.next).cursor).toBe("1")
      yield* signal(typing(threadId, groupId))
      expect(yield* signalsUntil(early.next, groupRead(actor.memberId))).toEqual([])
      // A resumed subscription replays commits but not the signals sent while it was away.
      const late = yield* listen({ after: ChangeFeed.Cursor.make("0") })
      expect(yield* late.next).toMatchObject({ _tag: "Ready", reset: false })
      expect(committed(yield* late.next).cursor).toBe("1")
      expect(yield* signalsUntil(late.next, groupRead(actor.memberId))).toEqual([])
    })
  )
)

/** A role every member may see, as a marker that everything before it was withheld. */
const roleMarker = (id: string) =>
  publish(RoleFacts.Created, {
    roleId: Role.Id.make(id),
    workspaceId,
    name: `Role ${id}`,
    permissions: []
  })
const charlieMember = Member.Id.make("charlie-member")

it.effect("workspace facts reach readers who may read them, and the member they concern", () =>
  run(
    () =>
      Effect.gen(function* () {
        const feed = yield* listen()
        yield* feed.next
        // Without invitation management or member and access reads, none of these reach the reader.
        yield* commit(publish(InvitationFacts.Issued, invitation("hidden")))
        yield* commit(
          publish(InvitationFacts.Revoked, {
            _tag: "Revoked",
            workspaceId,
            invitationId: Invitation.Id.make("hidden"),
            revokedBy: actor.memberId,
            revokedAt: at
          })
        )
        yield* commit(
          publish(MemberFacts.Added, {
            workspaceId,
            memberId: bobMember,
            identity: { _tag: "Human", id: Identity.HumanId.make("bob") },
            name: Member.Name.make("bob")
          })
        )
        yield* commit(
          publish(AssignmentFacts.Created, {
            workspaceId,
            assignmentId: Assignment.Id.make("bob-access"),
            memberId: bobMember,
            source: workspaceGrant(ThreadPermissions.Read)
          })
        )
        yield* commit(roleMarker("marker"))
        expect(committed(yield* feed.next).events.map((e) => e.name)).toEqual([RoleFacts.Created.name])
        // The member a fact concerns sees it anyway: their own access and their own removal.
        yield* commit(
          publish(AssignmentFacts.Created, {
            workspaceId,
            assignmentId: Assignment.Id.make("own-access"),
            memberId: actor.memberId,
            source: workspaceGrant(GroupPermissions.Read)
          })
        )
        expect(committed(yield* feed.next).events.map((e) => e.name)).toEqual([AssignmentFacts.Created.name])
        yield* commit(
          publish(AssignmentFacts.Revoked, {
            workspaceId,
            assignmentId: Assignment.Id.make("own-access"),
            memberId: actor.memberId
          })
        )
        expect(committed(yield* feed.next).events.map((e) => e.name)).toEqual([AssignmentFacts.Revoked.name])
        yield* commit(publish(MemberFacts.Removed, { workspaceId, memberId: actor.memberId }))
        expect(committed(yield* feed.next).events.map((e) => e.name)).toEqual([MemberFacts.Removed.name])
      }),
    { grants: [workspaceGrant(ThreadPermissions.Read)] }
  )
)

it.effect("an exact member-read grant shows that member's changes, and not others'", () =>
  run(
    () =>
      Effect.gen(function* () {
        const feed = yield* listen()
        yield* feed.next
        for (const memberId of [charlieMember, bobMember])
          yield* commit(
            publish(MemberFacts.Added, {
              workspaceId,
              memberId,
              identity: { _tag: "Human", id: Identity.HumanId.make(memberId) },
              name: Member.Name.make(memberId)
            })
          )
        expect(committed(yield* feed.next).events[0]?.payload).toMatchObject({
          memberId: bobMember
        })
        expect(yield* Queue.size(feed.queue)).toBe(0)
      }),
    {
      grants: [
        Assignment.Source.cases.Direct.make({
          grant: {
            permission: MemberPermissions.Read.name,
            scope: GrantScope.Scope.cases.Target.make({
              target: { _tag: "Member", workspaceId, memberId: bobMember }
            })
          }
        })
      ]
    }
  )
)

it.effect("a rename reaches every member without a read grant, with both names", () =>
  run(() =>
    Effect.gen(function* () {
      const feed = yield* listen()
      yield* feed.next
      yield* commit(publish(WorkspaceFacts.Renamed, { workspaceId, previousName: "Studio", name: "Atelier" }))
      const [event] = committed(yield* feed.next).events
      expect(event?.name).toBe(WorkspaceFacts.Renamed.name)
      expect(event?.payload).toEqual({ workspaceId, previousName: "Studio", name: "Atelier" })
    })
  )
)

it.effect("the reader's removal from the workspace is delivered, then the stream ends", () =>
  run(() =>
    Effect.gen(function* () {
      const feed = yield* listen()
      yield* feed.next
      yield* commit(publish(MemberFacts.Removed, { workspaceId, memberId: Member.Id.make("someone-else") }))
      expect(committed(yield* feed.next).events[0]?.name).toBe(MemberFacts.Removed.name)
      yield* commit(publish(MemberFacts.Removed, { workspaceId, memberId: actor.memberId }))
      expect(committed(yield* feed.next).events[0]?.payload).toEqual({
        workspaceId,
        memberId: actor.memberId
      })
      const exit = yield* Fiber.await(feed.fiber)
      expect(Exit.isFailure(exit) && Exit.findErrorOption(exit)).toEqual(
        Option.some(new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() }))
      )
    })
  )
)

it.effect("a revocation that commits while the reader subscribes still applies to the stream", () =>
  run(({ admitted, afterAccessRead }) =>
    Effect.gen(function* () {
      admitted.add(groupId)
      const journal = yield* Journal.Journal
      // The reader's admissions are read, and then their removal from the group commits.
      afterAccessRead(
        Effect.suspend(() => {
          admitted.delete(groupId)
          return commit(
            publish(GroupMembershipFacts.Removed, {
              groupId,
              membershipId: admission(groupId).id,
              workspaceId,
              memberId: actor.memberId,
              reason: "removed"
            })
          )
        }).pipe(Effect.asVoid, Effect.provideService(Journal.Journal, journal))
      )
      const feed = yield* listen()
      yield* feed.next
      yield* commit(publish(ThreadMessageFacts.Published, message("after", threadId, groupId)))
      yield* commit(roleMarker("marker"))
      expect(committed(yield* feed.next).events.map((e) => e.name)).toEqual([GroupMembershipFacts.Removed.name])
      expect(committed(yield* feed.next).events.map((e) => e.name)).toEqual([RoleFacts.Created.name])
    })
  )
)

it.effect("a workspace removal that commits while the reader subscribes still ends the stream", () =>
  run(({ fixture, afterMemberRead }) =>
    Effect.gen(function* () {
      const journal = yield* Journal.Journal
      // The reader's active membership is checked, and then their removal commits.
      afterMemberRead(
        Effect.andThen(
          fixture.store.transaction(fixture.members.markRemoved(actor.memberId)),
          commit(publish(MemberFacts.Removed, { workspaceId, memberId: actor.memberId }))
        ).pipe(Effect.asVoid, Effect.orDie, Effect.provideService(Journal.Journal, journal))
      )
      const feed = yield* listen()
      yield* feed.next
      yield* commit(roleMarker("marker"))
      expect(committed(yield* feed.next).events.map((e) => e.name)).toEqual([MemberFacts.Removed.name])
      const exit = yield* Fiber.await(feed.fiber)
      expect(Exit.isFailure(exit) && Exit.findErrorOption(exit)).toEqual(
        Option.some(new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() }))
      )
      expect(yield* Queue.size(feed.queue)).toBe(0)
    })
  )
)

it.effect("a slow subscriber catches up from the journal instead of losing commits", () =>
  run(
    () =>
      Effect.gen(function* () {
        const changeFeedService = yield* ChangeFeedService.ChangeFeedService
        const slow = yield* changeFeedService.watch()
        const fast = yield* listen()
        yield* fast.next
        for (const id of ["a", "b", "c", "d", "e"]) yield* commit(publish(InvitationFacts.Issued, invitation(id)))
        // Once the fast subscriber has everything, the follower has published it all.
        for (let index = 0; index < 5; index += 1) yield* fast.next
        const queue = yield* Queue.unbounded<ChangeFeed.Message>()
        yield* slow.pipe(
          Stream.runForEach((message) => Queue.offer(queue, message)),
          Effect.forkScoped
        )
        expect(yield* Queue.take(queue)).toMatchObject({ _tag: "Ready", cursor: null })
        const cursors: Array<string> = []
        for (let index = 0; index < 5; index += 1) cursors.push(committed(yield* Queue.take(queue)).cursor)
        expect(cursors).toEqual(["0", "1", "2", "3", "4"])
        // After catching up, the next delivery is the next commit, not a repeat.
        yield* commit(publish(InvitationFacts.Issued, invitation("f")))
        expect(committed(yield* Queue.take(queue)).cursor).toBe("5")
      }),
    { source: { capacity: 1, replayLimit: 500, pageSize: 2 } }
  )
)

it.effect("a commit this host cannot read ends each subscription, and resuming across it resets", () =>
  run(() =>
    Effect.gen(function* () {
      const Future = Fact.make(MemberFacts.Added.name, {
        version: 99,
        payload: Schema.String,
        subject: () => Subject.make("member", "future")
      })
      const feed = yield* listen()
      yield* feed.next
      yield* commit(publish(InvitationFacts.Issued, invitation("before")))
      const before = committed(yield* feed.next).cursor
      // Nothing of the commit arrives, not even the event this host can read.
      yield* commit(
        Effect.andThen(publish(InvitationFacts.Issued, invitation("beside")), publish(Future, "unknown to this host"))
      )
      const exit = yield* Fiber.await(feed.fiber)
      expect(Exit.isFailure(exit) && Exit.findErrorOption(exit)).toEqual(
        Option.some(new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() }))
      )
      expect(yield* Queue.size(feed.queue)).toBe(0)
      // Reconnecting from the last cursor resets rather than resuming across it.
      const resumed = yield* listen({ after: before })
      expect(yield* resumed.next).toMatchObject({ _tag: "Ready", cursor: "1", reset: true })
      // A cursor past it resumes, and the feed continues for both.
      const later = yield* listen({ after: ChangeFeed.Cursor.make("1") })
      expect(yield* later.next).toMatchObject({ _tag: "Ready", cursor: "1", reset: false })
      yield* commit(publish(InvitationFacts.Issued, invitation("after")))
      expect(committed(yield* resumed.next).cursor).toBe("2")
      expect(committed(yield* later.next).cursor).toBe("2")
    })
  )
)

it.effect("a commit this host cannot decode ends each subscription, and the feed goes on past it", () =>
  run(() =>
    Effect.gen(function* () {
      // A fact name and version this host delivers, with a payload its schema rejects, as a
      // damaged row or a schema changed without a new version would leave.
      const Damaged = Fact.make(MemberFacts.Added.name, {
        version: MemberFacts.Added.version,
        payload: Schema.String,
        subject: () => Subject.make("member", "damaged")
      })
      const feed = yield* listen()
      yield* feed.next
      yield* commit(publish(InvitationFacts.Issued, invitation("before")))
      const before = committed(yield* feed.next).cursor
      yield* commit(publish(Damaged, "not a member"))
      const exit = yield* Fiber.await(feed.fiber)
      expect(Exit.isFailure(exit) && Exit.findErrorOption(exit)).toEqual(
        Option.some(new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() }))
      )
      // Reconnecting from the last cursor resets, and later commits keep arriving.
      const resumed = yield* listen({ after: before })
      expect(yield* resumed.next).toMatchObject({ _tag: "Ready", cursor: "1", reset: true })
      yield* commit(publish(InvitationFacts.Issued, invitation("after")))
      expect(committed(yield* resumed.next).cursor).toBe("2")
    })
  )
)

it.effect("a removed member cannot subscribe", () =>
  run(({ fixture }) =>
    Effect.gen(function* () {
      yield* fixture.store.transaction(fixture.members.markRemoved(actor.memberId))
      const error = yield* Effect.flip((yield* ChangeFeedService.ChangeFeedService).watch())
      expect(error).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "InvalidActor" } })
    })
  )
)

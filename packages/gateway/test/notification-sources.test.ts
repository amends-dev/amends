import type { Core } from "@amends-dev/core"
import { Assignment, AssignmentFacts, Grant, type Permission, type Target } from "@amends-dev/core/authorization"
import { GroupService, GroupMembershipService, type GroupId } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Event, Journal, Publication } from "@amends-dev/core/journal"
import {
  Notification,
  NotificationService,
  type NotificationInbox,
  NotificationStore
} from "@amends-dev/core/notification"
import {
  ThreadService,
  ThreadMessageStore,
  ThreadMessageService,
  ThreadParticipation,
  ThreadParticipationFacts,
  ThreadParticipationActivity,
  ThreadParticipationService,
  ThreadPermissions,
  ThreadCommand,
  type ThreadQuery,
  type ThreadId,
  ThreadParticipationId
} from "@amends-dev/core/thread"
import { Member, MemberService, MemberFacts, MemberId } from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { Entry, Store, StoreError } from "@amends-dev/log"
import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import {
  type Bound,
  boundTo,
  listOldestFirst,
  otherWorkspaceId,
  placed,
  runHost,
  testProvenance,
  threadInternals,
  workspaceId
} from "./support.ts"

/** Resolving a notification's source under current access, without writing. */

const { core, initialized, runGateway } = Support
describe("notification sources", () => {
  /** Narrow a stored participation to its member participant for assertions. */
  const memberParticipant = (record: ThreadParticipation.ThreadParticipation) => {
    if (!ThreadParticipation.Participant.isAnyOf(["Member"])(record.participant))
      throw new Error("Expected a member participant")
    return record.participant
  }

  const humanId = MemberId.MemberId.make("human")
  const otherId = MemberId.MemberId.make("other")
  const agentId = MemberId.MemberId.make("agent")
  const identityFor = (id: MemberId.MemberId): Identity.MemberReference =>
    id === agentId
      ? { _tag: "Agent", id: Identity.AgentId.make("agent") }
      : { _tag: "Human", id: Identity.HumanId.make(id) }
  const actorFor = (memberId: MemberId.MemberId) =>
    Actor.Actor.of({ workspaceId, memberId, identity: identityFor(memberId) })
  const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor.Actor["Service"]) =>
    effect.pipe(Effect.provideService(Actor.Actor, actor))
  const run = <A, E, R>(bound: Bound, actor: Actor.Actor["Service"], effect: Effect.Effect<A, E, R>) =>
    asActor(effect, actor).pipe(Effect.provide(core(bound)))
  const facts = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Publication.Publication, testProvenance(bound.workspaceId)),
      Effect.provide(threadInternals.pipe(Layer.provideMerge(core(bound))))
    )
  const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 100 })
  const notifications = (bound: Bound, id: MemberId.MemberId) =>
    listOldestFirst(bound.notifications, Notification.ofMember(id, identityFor(id)), {
      limit: 100
    })
  const create = (memberIds: ReadonlyArray<MemberId.MemberId>) =>
    Effect.flatMap(GroupService.GroupService, (groupService) =>
      groupService.createTeam({ name: "Engineering", memberIds })
    )
  const start = (groupId: GroupId.GroupId, mentions: ReadonlyArray<MemberId.MemberId> = []) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.startInGroup({ groupId, mentions, text: "Opening" })
    ).pipe(Effect.flatMap(placed))
  const reply = (threadId: ThreadId.ThreadId, mentions: ReadonlyArray<MemberId.MemberId> = [], text = "Reply") =>
    Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
      threadMessageService.publish({ threadId, mentions, text })
    ).pipe(Effect.flatMap((message) => placed({ message })))
  const threadTarget = (threadId: ThreadId.ThreadId): Target.Reference => ({
    _tag: "Thread",
    workspaceId,
    threadId
  })
  const grant = (
    bound: Bound,
    memberId: MemberId.MemberId,
    permission: Permission.Definition,
    target?: Target.Reference
  ) =>
    facts(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.publish(AssignmentFacts.Created, {
          workspaceId: bound.workspaceId,
          assignmentId: Assignment.AssignmentId.make(
            `${memberId}:${permission.name}:${JSON.stringify(target ?? "workspace")}`
          ),
          memberId,
          source: {
            _tag: "Direct",
            grant: Grant.make(
              permission,
              target === undefined ? { _tag: "Workspace", workspaceId: bound.workspaceId } : { _tag: "Target", target }
            )
          }
        })
      )
    )
  const seed = (bound: Bound) =>
    facts(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          Effect.gen(function* () {
            for (const memberId of [humanId, otherId, agentId])
              yield* journal.publish(MemberFacts.Added, {
                workspaceId: bound.workspaceId,
                memberId,
                identity: identityFor(memberId),
                name: Member.Name.make(memberId)
              })
          })
        )
      )
    )
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId)
    const workspace = yield* initialized(bound)
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy }
    })
    yield* seed(bound)
    const group = yield* run(bound, owner, create([owner.memberId, humanId, agentId]))
    // Mentioning everyone, the author included, enrolls and notifies all three.
    const first = yield* run(bound, owner, start(group.id, [owner.memberId, humanId, agentId]))
    return { bound, owner, group, first, human: actorFor(humanId), agent: actorFor(agentId) }
  })

  const changed = <A extends object>(record: A, changes: Partial<A>): A => Object.assign({}, record, changes)
  /** The actor's inbox entry for a notification, if their inbox holds it. */
  const entryOf = (id: Notification.NotificationId) =>
    Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
      Effect.map(notificationService.inbox({ limit: 50 }), (items) => items.find((item) => item.notification.id === id))
    )
  /** What the actor's inbox shows their notification pointing to; undefined when it shows none. */
  const sourceOf = (id: Notification.NotificationId) =>
    Effect.flatMap(entryOf(id), (entry) =>
      entry === undefined ? Effect.die(`${id} is not in the inbox`) : Effect.succeed(entry.source)
    )
  const inboxGet = (id: Notification.NotificationId) => Effect.map(entryOf(id), (entry) => entry?.notification)
  const noteFor = Effect.fnUntraced(function* (bound: Bound, id: MemberId.MemberId) {
    const note = (yield* notifications(bound, id))[0]
    if (!note) return yield* Effect.die("Missing notification")
    return note
  })
  const withNote = (bound: Bound, note: Notification.Notification): Bound => ({
    ...bound,
    context: Context.add(bound.context, NotificationStore.NotificationStore, {
      ...bound.notifications,
      listLatestByRecipient: () => Effect.succeed([note])
    })
  })
  const snapshot = Effect.fnUntraced(function* (bound: Bound, threadId: ThreadId.ThreadId) {
    return {
      history: yield* history(bound),
      participants: yield* bound.participations.listByThread(threadId),
      human: yield* notifications(bound, humanId),
      agent: yield* notifications(bound, agentId),
      checkpoint: yield* bound.checkpoints.get({
        logId: Entry.LogId.make("journal"),
        name: "notifications",
        version: 1
      })
    }
  })

  it.effect("humans and agents resolve only authorized source content using a direct read without side effects", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          expectTypeOf<Extract<Core.Operations, ThreadQuery.ThreadQuery>>().toEqualTypeOf<never>()
          const { bound, owner, first, human, agent } = yield* prepare()
          for (const actor of [human, agent])
            yield* grant(bound, actor.memberId, ThreadPermissions.Read, threadTarget(first.thread.id))
          const before = yield* snapshot(bound, first.thread.id)
          let lookups = 0
          const readOnly = {
            ...bound,
            context: Context.add(bound.context, Store.Store, {
              ...bound.store,
              transaction: () => Effect.die("Source reads must not open a transaction"),
              read: () => Effect.die("Source reads must not scan log batches"),
              readEntries: () => Effect.die("Source reads must not scan journal facts"),
              getEntry: (logId, entryId) => {
                lookups++
                return bound.store.getEntry(logId, entryId)
              }
            })
          }
          for (const actor of [human, agent]) {
            const note = yield* noteFor(bound, actor.memberId)
            const result = yield* run(readOnly, actor, sourceOf(note.id))
            if (result === undefined) return yield* Effect.die("Expected a source")
            expect(result).toEqual({ activity: first.activity, message: first.message })
            expect(Object.keys(result).sort()).toEqual(["activity", "message"])
            expect(result).toEqual(
              (yield* run(
                bound,
                owner,
                Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                  threadService.readTimeline(first.thread.id, { limit: 1 })
                )
              ))[0]
            )
          }
          expect(lookups).toBe(2)
          expect(yield* snapshot(bound, first.thread.id)).toEqual(before)
        })
      )
    )
  )

  it.effect("the inbox holds only its reader's notifications, and checks their identity before reading sources", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, human, agent } = yield* prepare()
          const note = yield* noteFor(bound, humanId)
          const protectedBound = {
            ...bound,
            context: Context.add(bound.context, Store.Store, {
              ...bound.store,
              getEntry: () => Effect.die("Source must not be read")
            })
          }
          // Another recipient's notification never reaches the inbox.
          for (const actor of [owner, agent]) expect(yield* run(bound, actor, entryOf(note.id))).toBeUndefined()
          expect(
            yield* Effect.flip(run(protectedBound, { ...human, identity: owner.identity }, entryOf(note.id)))
          ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "InvalidActor" } })
          yield* run(
            bound,
            owner,
            Effect.flatMap(MemberService.MemberService, (memberService) => memberService.remove(humanId))
          )
          expect(yield* Effect.flip(run(protectedBound, human, entryOf(note.id)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "InvalidActor" }
          })
        })
      )
    )
  )

  it.effect("current grants and group access control historical sources independently of participation", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, group, first, human } = yield* prepare()
          const note = yield* noteFor(bound, humanId)
          expect(yield* run(bound, human, inboxGet(note.id))).toEqual(note)
          expect(yield* run(bound, human, sourceOf(note.id))).toBeUndefined()
          const assignment = yield* grant(bound, humanId, ThreadPermissions.Read, threadTarget(first.thread.id))
          const service = yield* NotificationService.NotificationService.pipe(Effect.provide(core(bound)))
          const part = Option.getOrThrow(
            yield* bound.participations.get(
              note.participationId ?? ThreadParticipationId.ThreadParticipationId.make("missing")
            )
          )
          yield* run(
            bound,
            human,
            Effect.flatMap(ThreadParticipationService.ThreadParticipationService, (threadParticipationService) =>
              threadParticipationService.unfollow({
                threadId: first.thread.id,
                participationId: part.id
              })
            )
          )
          expect(
            yield* asActor(
              sourceOf(note.id).pipe(Effect.provideService(NotificationService.NotificationService, service)),
              human
            )
          ).toEqual({
            activity: first.activity,
            message: first.message
          })
          yield* facts(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(AssignmentFacts.Revoked, {
                workspaceId,
                assignmentId: assignment.payload.assignmentId,
                memberId: assignment.payload.memberId
              })
            )
          )
          expect(
            yield* asActor(
              sourceOf(note.id).pipe(Effect.provideService(NotificationService.NotificationService, service)),
              human
            )
          ).toBeUndefined()
          yield* grant(bound, humanId, ThreadPermissions.Read)
          yield* run(
            bound,
            human,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.leave({
                groupId: group.id,
                membershipId: memberParticipant(part).groupMembershipId
              })
            )
          )
          // Leaving settles what was pending from the group; it stays as history.
          const settled = Object.assign({}, note, {
            state: { _tag: "Discarded", reason: "access-lost" }
          })
          expect(yield* run(bound, human, inboxGet(note.id))).toEqual(settled)
          expect(
            yield* asActor(
              sourceOf(note.id).pipe(Effect.provideService(NotificationService.NotificationService, service)),
              human
            )
          ).toBeUndefined()
          yield* run(
            bound,
            owner,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.add({ groupId: group.id, memberId: humanId })
            )
          )
          expect(
            yield* asActor(
              sourceOf(note.id).pipe(Effect.provideService(NotificationService.NotificationService, service)),
              human
            )
          ).toEqual({
            activity: first.activity,
            message: first.message
          })
          expect(yield* bound.participations.get(part.id)).toMatchObject({
            value: { status: "ended" }
          })
          // Rejoining resolves its source again but does not revive it as pending.
          expect(yield* notifications(bound, humanId)).toEqual([settled])
        })
      )
    )
  )

  it.effect("the inbox lists the reader's notifications newest first with the sources they can read", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, group, first, human } = yield* prepare()
          yield* grant(bound, humanId, ThreadPermissions.Read)
          yield* TestClock.adjust("1 second")
          const second = yield* run(bound, owner, reply(first.thread.id, [humanId], "Second"))
          const inbox = (options: NotificationInbox.Options) =>
            run(
              bound,
              human,
              Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
                notificationService.inbox(options)
              )
            )
          const [older, newer] = yield* notifications(bound, humanId)
          if (!older || !newer) return yield* Effect.die("Missing notifications")
          expect(yield* inbox({ limit: 10 })).toEqual([
            { notification: newer, source: second },
            {
              notification: older,
              source: { activity: first.activity, message: first.message }
            }
          ])
          expect(
            yield* inbox({
              limit: 1,
              before: { recordedAt: newer.recordedAt, id: newer.id }
            })
          ).toEqual([
            {
              notification: older,
              source: { activity: first.activity, message: first.message }
            }
          ])
          // What the reader saw stays in the inbox and leaves what is pending.
          const seen = yield* run(
            bound,
            human,
            Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
              notificationService.markSeen(older.id)
            )
          )
          expect((yield* inbox({ limit: 10 })).map((item) => item.notification)).toEqual([newer, seen])
          expect((yield* inbox({ limit: 10, pendingOnly: true })).map((item) => item.notification)).toEqual([newer])
          // Leaving the group keeps the notifications without what they point to, and settles
          // the pending one: the reader no longer waits on a thread they cannot open.
          const part = Option.getOrThrow(
            yield* bound.participations.get(
              newer.participationId ?? ThreadParticipationId.ThreadParticipationId.make("missing")
            )
          )
          yield* run(
            bound,
            human,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.leave({
                groupId: group.id,
                membershipId: memberParticipant(part).groupMembershipId
              })
            )
          )
          expect(yield* inbox({ limit: 10 })).toEqual([
            {
              notification: Object.assign({}, newer, {
                state: { _tag: "Discarded", reason: "access-lost" }
              })
            },
            { notification: seen }
          ])
          expect(yield* inbox({ limit: 10, pendingOnly: true })).toEqual([])
          // Nobody else reads this inbox.
          expect(
            yield* run(
              bound,
              owner,
              Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
                notificationService.inbox({ limit: 10 })
              )
            )
          ).toEqual([])
        })
      )
    )
  )

  it.effect("discarded agent notifications remain readable history without becoming pending work", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, first, agent } = yield* prepare()
          yield* grant(bound, agentId, ThreadPermissions.Read)
          const note = yield* noteFor(bound, agentId)
          const participationId = note.participationId
          if (participationId === undefined) return yield* Effect.die("Missing participation")
          yield* run(
            bound,
            agent,
            Effect.flatMap(ThreadParticipationService.ThreadParticipationService, (threadParticipationService) =>
              threadParticipationService.unfollow({
                threadId: first.thread.id,
                participationId
              })
            )
          )
          const before = yield* snapshot(bound, first.thread.id)
          expect(yield* run(bound, agent, sourceOf(note.id))).toEqual({
            activity: first.activity,
            message: first.message
          })
          expect(yield* snapshot(bound, first.thread.id)).toEqual(before)
          expect((yield* notifications(bound, agentId))[0]?.state).toEqual({
            _tag: "Discarded",
            reason: "participation-ended"
          })
        })
      )
    )
  )

  it.effect("missing or unsupported sources are unavailable and lookups stay scoped to the workspace journal", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, first, human } = yield* prepare()
          yield* grant(bound, humanId, ThreadPermissions.Read)
          const note = yield* noteFor(bound, humanId)
          const nonActivity = (yield* history(bound))
            .flatMap((b) => b.entries)
            .find((e) => e.name === MemberFacts.Added.name)
          if (!nonActivity) return yield* Effect.die("Missing fixture fact")
          for (const source of [
            { logId: note.source.logId, entryId: Entry.EntryId.make("missing") },
            { logId: Entry.LogId.make("another-log"), entryId: note.source.entryId },
            { logId: nonActivity.logId, entryId: nonActivity.id }
          ])
            expect(yield* run(withNote(bound, changed(note, { source })), human, sourceOf(note.id))).toBeUndefined()
          const entry = Option.getOrThrow(yield* bound.store.getEntry(note.source.logId, note.source.entryId))
          // The same entry, recorded with a version of the fact this host does not know.
          const envelope = yield* Event.storageCodec.decode(entry)
          const unknownVersion = yield* Event.storageCodec.encode(changed(envelope, { version: 999 }))
          const context = Context.add(bound.context, Store.Store, {
            ...bound.store,
            getEntry: () => Effect.succeedSome(changed(entry, unknownVersion))
          })
          expect(yield* run({ ...bound, context }, human, sourceOf(note.id))).toBeUndefined()
          expect(yield* bound.store.getEntry(Entry.LogId.make("another-log"), entry.id)).toEqual(Option.none())
          const foreign = yield* boundTo(otherWorkspaceId)
          expect(yield* foreign.store.getEntry(entry.logId, entry.id)).toEqual(Option.none())
          entry.payload.fill(0)
          expect(
            Option.getOrThrow(yield* bound.store.getEntry(note.source.logId, note.source.entryId)).payload
          ).not.toEqual(entry.payload)
          expect(yield* run(bound, human, sourceOf(note.id))).toEqual({
            activity: first.activity,
            message: first.message
          })
        })
      )
    )
  )

  it.effect("a source's storage failure ends the read as a defect, and a denied read never loads message content", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, human } = yield* prepare()
          const note = yield* noteFor(bound, humanId)
          const guarded = Context.add(bound.context, ThreadMessageStore.ThreadMessageStore, {
            ...bound.messages,
            get: () => Effect.die("Message must not be read without permission"),
            getMany: () => Effect.die("Message must not be read without permission")
          })
          expect(yield* run({ ...bound, context: guarded }, human, sourceOf(note.id))).toBeUndefined()
          const failure = StoreError.failed("Store", "getEntry")("injected")
          const failing = Context.add(bound.context, Store.Store, {
            ...bound.store,
            getEntry: () => Effect.fail(failure)
          })
          expect(
            yield* Effect.catchDefect(run({ ...bound, context: failing }, human, sourceOf(note.id)), Effect.succeed)
          ).toBe(failure)
        })
      )
    )
  )

  it.effect("follow and ending sources use the same typed resolver and omit internal identities", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, group } = yield* prepare()
          const first = yield* run(bound, owner, start(group.id, [agentId]))
          const ownerPart = (yield* bound.participations.listByThread(first.thread.id)).find(
            (p) => ThreadParticipation.memberOf(p.participant) === owner.memberId
          )
          if (!ownerPart) return yield* Effect.die("Missing owner")
          const events = yield* facts(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  const threadCommand = yield* ThreadCommand.ThreadCommand
                  const occurredAt = yield* DateTime.now
                  const recipients = [
                    {
                      participationId: ownerPart.id,
                      recipient: ThreadParticipation.recipientOf(ownerPart.participant),
                      requestsWork: false
                    }
                  ]
                  // Deliberately address non-message activity to exercise the generic generator.
                  // Production follow/unfollow workflows select an empty recipient list.
                  const followed = yield* threadCommand.publishActivity({
                    thread: first.thread,
                    occurredAt,
                    admit: [{ _tag: "Member", memberId: humanId }],
                    step: ({ admitted }) => {
                      const [participant] = admitted.participants
                      const [added] = admitted.added
                      if (participant === undefined || added === undefined)
                        return Effect.die("Missing fixture participant")
                      return Effect.succeed({
                        value: participant,
                        kind: ThreadParticipationActivity.Followed,
                        details: { participationId: participant.id },
                        recipients,
                        cause: added
                      })
                    }
                  })
                  const participant = followed.value
                  const departure = yield* threadCommand.publishActivity({
                    thread: first.thread,
                    occurredAt,
                    step: () =>
                      Effect.map(
                        journal
                          .publish(ThreadParticipationFacts.Ended, {
                            workspaceId,
                            groupId: first.thread.groupId,
                            threadId: first.thread.id,
                            participationId: participant.id,
                            memberId: memberParticipant(participant).memberId,
                            reason: "unfollowed"
                          })
                          .pipe(Publication.withOccurredAt(occurredAt)),
                        (ended) => ({
                          value: undefined,
                          kind: ThreadParticipationActivity.Ended,
                          details: {
                            participationId: participant.id,
                            reason: "unfollowed" as const
                          },
                          recipients,
                          cause: ended
                        })
                      )
                  })
                  return [followed.event, departure.event]
                })
              )
            )
          )
          const timeline = yield* run(
            bound,
            owner,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.readTimeline(first.thread.id, { limit: 10 })
            )
          )
          const notes = yield* listOldestFirst(
            bound.notifications,
            Notification.ofMember(owner.memberId, owner.identity),
            {
              limit: 100
            }
          )
          for (const event of events) {
            const note = notes.find((n) => n.source.entryId === event.id)
            if (!note) return yield* Effect.die("Missing source notification")
            const result = yield* run(bound, owner, sourceOf(note.id))
            expect(result).toEqual(timeline.find((item) => item.activity.id === event.payload.activity.id))
            if (result === undefined || !("participant" in result)) return yield* Effect.die("Wrong source subject")
            expect(Object.keys(result.participant).sort()).toEqual([
              "id",
              "joinedAt",
              "joinedAtSequence",
              "participant",
              "threadId",
              "workspaceId"
            ])
            expect(Object.keys(result.participant.participant).sort()).toEqual(["_tag", "memberId"])
          }
        })
      )
    )
  )

  it.effect(
    "source resolution observes staged publication, revocation, and group departure in an outer transaction",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, first, group, human } = yield* prepare()
            const assignment = yield* grant(bound, humanId, ThreadPermissions.Read)
            const note = yield* noteFor(bound, humanId)
            const before = yield* snapshot(bound, first.thread.id)
            const operation = Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  const result = yield* reply(first.thread.id, [humanId], "Staged reply")
                  const latest = (yield* notifications(bound, humanId)).find((n) => n.id !== note.id)
                  if (!latest) return yield* Effect.die("Missing staged notification")
                  expect(yield* asActor(sourceOf(latest.id), human)).toEqual(result)
                  yield* journal.publish(AssignmentFacts.Revoked, {
                    workspaceId,
                    assignmentId: assignment.payload.assignmentId,
                    memberId: assignment.payload.memberId
                  })
                  expect(yield* asActor(sourceOf(latest.id), human)).toBeUndefined()
                  return yield* Effect.fail("rolled back" as const)
                }).pipe(Publication.withActor)
              )
            )
            expect(yield* Effect.flip(run(bound, owner, operation))).toBe("rolled back")
            expect(yield* snapshot(bound, first.thread.id)).toEqual(before)
            const admission = Option.getOrThrow(yield* bound.groupMemberships.findActive(group.id, humanId))
            const leave = Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* asActor(
                    Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
                      groupMembershipService.leave({
                        groupId: group.id,
                        membershipId: admission.id
                      })
                    ),
                    human
                  )
                  expect(yield* asActor(sourceOf(note.id), human)).toBeUndefined()
                  return yield* Effect.fail("rolled back" as const)
                })
              )
            )
            expect(yield* Effect.flip(run(bound, owner, leave))).toBe("rolled back")
            expect(yield* snapshot(bound, first.thread.id)).toEqual(before)
          })
        )
      )
  )

  it.effect("sources resolve after reopening, and the gateway shows a missing source as none", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, first, human } = yield* prepare()
              yield* grant(bound, humanId, ThreadPermissions.Read)
              return { first, human, note: yield* noteFor(bound, humanId) }
            })
          )
        )
        yield* runGateway(
          storage,
          Effect.gen(function* () {
            const gateway = yield* Gateway.Gateway
            expect(yield* gateway.asMember(workspaceId, saved.human.identity, sourceOf(saved.note.id))).toEqual({
              activity: saved.first.activity,
              message: saved.first.message
            })
            const bound = yield* boundTo(workspaceId)
            const unavailable = changed(saved.note, {
              id: Notification.NotificationId.make("missing-source"),
              source: { logId: Entry.LogId.make("journal"), entryId: Entry.EntryId.make("missing") }
            })
            yield* bound.store.transaction(bound.notifications.insert(unavailable))
            expect(yield* gateway.asMember(workspaceId, saved.human.identity, sourceOf(unavailable.id))).toBeUndefined()
          })
        )
      })
    )
  )
})

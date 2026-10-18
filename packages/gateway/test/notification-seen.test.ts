import { Assignment, AssignmentFacts, BuiltinRoles } from "@amends-dev/core/authorization"
import { GroupService, GroupMembershipService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Event, Journal, Publication } from "@amends-dev/core/journal"
import { Notification, NotificationFacts, NotificationService, NotificationStore } from "@amends-dev/core/notification"
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipation,
  ThreadParticipationService
} from "@amends-dev/core/thread"
import { Member, MemberService, MemberFacts, MemberId } from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { Entry, Store, StoreError } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { Context, DateTime, Effect, Exit, Option } from "effect"
import { TestClock } from "effect/testing"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import {
  type Bound,
  boundTo,
  journalLog,
  listOldestFirst,
  otherWorkspaceId,
  placed,
  runHost,
  testProvenance,
  workspaceId
} from "./support.ts"

/**
 * Marking notifications seen: a person's Seen is recorded in the journal as `NotificationFacts.Seen`.
 * Ownership, repeats, transactions, hosts, and rebuilds.
 */

const { core, initialized, runGateway } = Support
describe("marking notifications seen", () => {
  const human: Actor.Actor["Service"] = {
    workspaceId,
    memberId: MemberId.MemberId.make("human"),
    identity: { _tag: "Human", id: Identity.HumanId.make("recipient") }
  }
  const agent: Actor.Actor["Service"] = {
    workspaceId,
    memberId: MemberId.MemberId.make("agent"),
    identity: { _tag: "Agent", id: Identity.AgentId.make("recipient") }
  }
  /** Writes the opening message, so the others, including the owner, receive it. */
  const writer: Actor.Actor["Service"] = {
    workspaceId,
    memberId: MemberId.MemberId.make("writer"),
    identity: { _tag: "Human", id: Identity.HumanId.make("writer") }
  }
  const run = <A, E, R>(bound: Bound, actor: Actor.Actor["Service"], effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(core(bound)))
  const facts = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(Publication.Publication, testProvenance()), Effect.provide(core(bound)))
  const markSeen = (id: Notification.NotificationId) =>
    Effect.flatMap(NotificationService.NotificationService, (notificationService) => notificationService.markSeen(id))
  /** What the actor's inbox shows a notification pointing to, or undefined without a source. */
  const sourceOf = (id: Notification.NotificationId) =>
    Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
      Effect.map(
        notificationService.inbox({ limit: 50 }),
        (items) => items.find((item) => item.notification.id === id)?.source
      )
    )
  /** A member's inbox, as their membership. */
  const notes = (bound: Bound, member: Actor.Actor["Service"]) =>
    listOldestFirst(bound.notifications, Notification.ofMember(member.memberId, member.identity), {
      limit: 100
    })
  const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 100 })
  /** The notifications the journal records as seen, in order. */
  const seenFacts = (bound: Bound) =>
    facts(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.log.readEntries({ name: NotificationFacts.Seen.name, limit: 100 }).pipe(
          Effect.flatMap(Effect.forEach((entry) => Event.decode(NotificationFacts.Seen, entry))),
          Effect.map((events) => events.map(({ payload }) => payload.notificationId))
        )
      )
    )
  const seenAt = DateTime.makeUnsafe("2026-09-21T12:00:00.123Z")
  const seenState = (seenAt: DateTime.Utc): Notification.State => Notification.State.cases.Seen.make({ seenAt })
  const changed = <A extends object>(record: A, changes: Partial<A>): A => Object.assign({}, record, changes)
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId)
    const workspace = yield* initialized(bound)
    const owner: Actor.Actor["Service"] = {
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy }
    }
    yield* facts(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          Effect.forEach([human, agent, writer], (actor) =>
            journal.publish(MemberFacts.Added, {
              workspaceId,
              memberId: actor.memberId,
              identity: actor.identity,
              name: Member.Name.make(actor.identity.id)
            })
          ).pipe(
            Effect.andThen(
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.AssignmentId.make("writer-viewer"),
                memberId: writer.memberId,
                source: {
                  _tag: "Role",
                  roleId: BuiltinRoles.MemberId,
                  scope: { _tag: "Workspace", workspaceId }
                }
              })
            )
          )
        )
      )
    )
    const group = yield* run(
      bound,
      owner,
      Effect.flatMap(GroupService.GroupService, (groupService) =>
        groupService.createTeam({
          name: "Team",
          memberIds: [owner.memberId, human.memberId, agent.memberId, writer.memberId]
        })
      )
    )
    const first = yield* run(
      bound,
      writer,
      Effect.flatMap(ThreadService.ThreadService, (threadService) =>
        // Mentioning the three others enrolls and notifies them; the writer is not notified.
        threadService.startInGroup({
          groupId: group.id,
          mentions: [owner.memberId, human.memberId, agent.memberId],
          text: "Proposal"
        })
      ).pipe(Effect.flatMap(placed))
    )
    const humanNote = (yield* notes(bound, human))[0]
    const agentNote = (yield* notes(bound, agent))[0]
    const ownerNote = (yield* notes(bound, owner))[0]
    if (!humanNote || !agentNote || !ownerNote) return yield* Effect.die("Missing generated notifications")
    return { bound, owner, group, first, humanNote, agentNote, ownerNote }
  })
  const snapshot = Effect.fnUntraced(function* (p: Effect.Success<ReturnType<typeof prepare>>) {
    return {
      history: yield* history(p.bound),
      live: yield* p.bound.checkpoints.listLive(journalLog),
      human: yield* notes(p.bound, human),
      agent: yield* notes(p.bound, agent),
      owner: yield* notes(p.bound, p.owner),
      activity: yield* p.bound.activities.listByThread(p.first.thread.id),
      participation: yield* p.bound.participations.listByThread(p.first.thread.id)
    }
  })

  it.effect("marking seen records it in the journal once, with a stable time", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const before = yield* snapshot(p)
          const now = yield* DateTime.now
          const result = yield* run(p.bound, human, markSeen(p.humanNote.id))
          expect(result).toEqual(changed(p.humanNote, { state: seenState(now) }))
          expect(yield* p.bound.notifications.get(result.id)).toEqual(Option.some(result))
          expect(
            yield* p.bound.notifications.listPendingByRecipient(Notification.ofMember(human.memberId, human.identity), {
              limit: 100
            })
          ).toEqual([])
          expect(yield* notes(p.bound, human)).toEqual([result])
          const after = yield* snapshot(p)
          expect(Object.assign({}, after, { history: before.history })).toEqual(
            Object.assign({}, before, { human: [result] })
          )
          expect(yield* seenFacts(p.bound)).toEqual([result.id])
          // Seen again later keeps the first time, and records nothing more.
          yield* TestClock.adjust("1 second")
          expect(yield* run(p.bound, human, markSeen(result.id))).toEqual(result)
          expect(yield* snapshot(p)).toEqual(after)
          const ownerResult = yield* run(p.bound, p.owner, markSeen(p.ownerNote.id))
          expect(ownerResult.state._tag).toBe("Seen")
          expect(yield* run(p.bound, p.owner, sourceOf(p.ownerNote.id))).toEqual({
            message: p.first.message,
            activity: p.first.activity
          })
        })
      )
    )
  )

  it.effect("seeing everything through the newest shown leaves later arrivals pending, and the count follows", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const service =
            (actor: Actor.Actor["Service"]) =>
            <A, E>(use: (s: NotificationService.NotificationService["Service"]) => Effect.Effect<A, E, Actor.Actor>) =>
              run(p.bound, actor, Effect.flatMap(NotificationService.NotificationService, use))
          const asHuman = service(human)
          const pending = () =>
            p.bound.notifications.listPendingByRecipient(Notification.ofMember(human.memberId, human.identity), {
              limit: 100
            })
          yield* TestClock.adjust("1 second")
          // The writer's reply reaches the thread's participants, the human among them.
          yield* run(
            p.bound,
            writer,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({
                threadId: p.first.thread.id,
                text: "Any thoughts?",
                mentions: []
              })
            )
          )
          const [older, newer] = yield* pending()
          if (!older || !newer) return yield* Effect.die("Expected two pending notifications")
          expect(older.id).toBe(p.humanNote.id)
          expect((yield* asHuman((s) => s.countPending)).pending).toBe(2)
          // Through the older one: the newer, which the reader had not seen, stays pending.
          expect(yield* asHuman((s) => s.markSeenThrough({ recordedAt: older.recordedAt, id: older.id }))).toBe(1)
          expect(yield* pending()).toEqual([newer])
          expect((yield* asHuman((s) => s.countPending)).pending).toBe(1)
          const through = { recordedAt: newer.recordedAt, id: newer.id }
          expect(yield* asHuman((s) => s.markSeenThrough(through))).toBe(1)
          expect((yield* asHuman((s) => s.countPending)).pending).toBe(0)
          // Nothing left to see marks nothing.
          expect(yield* asHuman((s) => s.markSeenThrough(through))).toBe(0)
          // Agents accept work rather than seeing it, and everyone counts only their own.
          expect(yield* Effect.flip(service(agent)((s) => s.markSeenThrough(through)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "HumanRequired" }
          })
          expect((yield* service(p.owner)((s) => s.countPending)).pending).toBe(2)
          expect(
            yield* p.bound.notifications.countPendingByRecipient(
              Notification.ofMember(p.owner.memberId, p.owner.identity)
            )
          ).toBe(2)
        })
      )
    )
  )

  it.effect("marking seen requires active ownership, has no role bypass, and cannot accept agent work", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const before = yield* snapshot(p)
          for (const [actor, id, tag] of [
            [p.owner, p.humanNote.id, "CoreError.NotFound"],
            [agent, p.humanNote.id, "CoreError.NotFound"],
            [human, p.agentNote.id, "CoreError.NotFound"],
            [human, Notification.NotificationId.make("missing"), "CoreError.NotFound"],
            [agent, p.agentNote.id, "CoreError.Denied"],
            [changed(human, { identity: p.owner.identity }), p.humanNote.id, "CoreError.Denied"]
          ] as const)
            expect(yield* Effect.flip(run(p.bound, actor, markSeen(id)))).toMatchObject({
              _tag: tag
            })
          expect(yield* snapshot(p)).toEqual(before)
          // A captured application still checks membership on every call.
          yield* run(
            p.bound,
            human,
            Effect.gen(function* () {
              const notificationService = yield* NotificationService.NotificationService
              yield* run(
                p.bound,
                p.owner,
                Effect.flatMap(MemberService.MemberService, (memberService) => memberService.remove(human.memberId))
              )
              expect(yield* Effect.flip(notificationService.markSeen(p.humanNote.id))).toMatchObject({
                _tag: "CoreError.Denied",
                reason: { _tag: "InvalidActor" }
              })
            })
          )
          // Removal from the workspace ended their access, which settled what was pending.
          expect(yield* p.bound.notifications.get(p.humanNote.id)).toEqual(
            Option.some(
              Object.assign({}, p.humanNote, {
                state: { _tag: "Discarded", reason: "access-lost" }
              })
            )
          )
        })
      )
    )
  )

  it.effect("people can clear their own inbox after source access is lost without resolving or rejoining", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          // Still in the group, the reader has lost the source through their grants.
          expect(yield* run(p.bound, human, sourceOf(p.humanNote.id))).toBeUndefined()
          const before = yield* snapshot(p)
          const bound = {
            ...p.bound,
            context: Context.add(p.bound.context, Store.Store, {
              ...p.bound.store,
              getEntry: () => Effect.die("Marking seen must not read the source")
            })
          }
          expect((yield* run(bound, human, markSeen(p.humanNote.id))).state._tag).toBe("Seen")
          expect(yield* run(p.bound, human, sourceOf(p.humanNote.id))).toBeUndefined()
          expect((yield* snapshot(p)).participation).toEqual(before.participation)
          // Leaving afterwards keeps what they saw as seen; only the pending is settled.
          const admission = Option.getOrThrow(yield* p.bound.groupMemberships.findActive(p.group.id, human.memberId))
          yield* run(
            p.bound,
            human,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.leave({
                groupId: p.group.id,
                membershipId: admission.id
              })
            )
          )
          expect(yield* p.bound.notifications.get(p.humanNote.id)).toMatchObject({
            value: { state: { _tag: "Seen" } }
          })
          const missing = changed(p.humanNote, {
            id: Notification.NotificationId.make("missing-source"),
            source: { logId: Entry.LogId.make("other-log"), entryId: p.humanNote.source.entryId }
          })
          yield* p.bound.store.transaction(p.bound.notifications.insert(missing))
          expect((yield* run(bound, human, markSeen(missing.id))).state._tag).toBe("Seen")
        })
      )
    )
  )

  it.effect("a failed Seen write leaves the notification pending, and a retry records it", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const before = yield* snapshot(p)
          const context = Context.add(p.bound.context, NotificationStore.NotificationStore, {
            ...p.bound.notifications,
            markSeen: () => Effect.fail(StoreError.failed("NotificationStore", "markSeen")("injected"))
          })
          expect(
            Exit.isFailure(yield* Effect.exit(run({ ...p.bound, context }, human, markSeen(p.humanNote.id))))
          ).toBe(true)
          expect(yield* snapshot(p)).toEqual(before)
          expect((yield* run(p.bound, human, markSeen(p.humanNote.id))).state._tag).toBe("Seen")
        })
      )
    )
  )

  it.effect("seeing what leaving its group settled reports it handled, and marking all passes over it", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const elsewhere = yield* run(
            p.bound,
            p.owner,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({
                name: "Elsewhere",
                memberIds: [p.owner.memberId, human.memberId]
              })
            )
          )
          yield* run(
            p.bound,
            p.owner,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startInGroup({
                groupId: elsewhere.id,
                mentions: [human.memberId],
                text: "Hi"
              })
            )
          )
          const other = (yield* notes(p.bound, human)).find((note) => note.id !== p.humanNote.id)
          if (other === undefined) return yield* Effect.die("Missing second notification")
          const admission = Option.getOrThrow(yield* p.bound.groupMemberships.findActive(p.group.id, human.memberId))
          yield* run(
            p.bound,
            human,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.leave({ groupId: p.group.id, membershipId: admission.id })
            )
          )
          expect(yield* Effect.flip(run(p.bound, human, markSeen(p.humanNote.id)))).toMatchObject({
            _tag: "CoreError.Conflict",
            reason: { _tag: "AlreadyHandled" }
          })
          expect(yield* p.bound.notifications.get(p.humanNote.id)).toMatchObject({
            value: { state: { _tag: "Discarded", reason: "access-lost" } }
          })
          // Through the later of the two, so both are due; only the one still pending is marked.
          const through = [p.humanNote, other].toSorted(
            (left, right) => DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt)
          )[1]!
          expect(
            yield* run(
              p.bound,
              human,
              Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
                notificationService.markSeenThrough({ recordedAt: through.recordedAt, id: through.id })
              )
            )
          ).toBe(1)
          expect(yield* p.bound.notifications.get(other.id)).toMatchObject({
            value: { state: { _tag: "Seen" } }
          })
          expect(yield* seenFacts(p.bound)).toEqual([other.id])
        })
      )
    )
  )

  it.effect("Seen joins its caller's transaction, sees staged records, and rolls back with the caller", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const before = yield* snapshot(p)
          const staged = changed(p.humanNote, {
            id: Notification.NotificationId.make("staged"),
            source: { logId: Entry.LogId.make("staged"), entryId: p.humanNote.source.entryId }
          })
          const operation = facts(
            p.bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* p.bound.notifications.insert(staged)
                  yield* p.bound.notifications.markSeen([staged.id], seenAt)
                  expect(yield* p.bound.notifications.get(staged.id)).toEqual(
                    Option.some(changed(staged, { state: seenState(seenAt) }))
                  )
                  yield* markSeen(p.humanNote.id).pipe(Effect.provideService(Actor.Actor, human))
                  return yield* Effect.fail("rollback")
                })
              )
            )
          )
          expect(yield* Effect.flip(operation)).toBe("rollback")
          expect(yield* snapshot(p)).toEqual(before)
          expect(yield* p.bound.notifications.get(staged.id)).toEqual(Option.none())
          expect(yield* run(p.bound, human, markSeen(p.humanNote.id))).toMatchObject({
            state: { _tag: "Seen" }
          })
        })
      )
    )
  )

  it.effect("staged member removal prevents marking seen within the same outer commit", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const before = yield* snapshot(p)
          const operation = run(
            p.bound,
            p.owner,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* Effect.flatMap(MemberService.MemberService, (memberService) =>
                    memberService.remove(human.memberId)
                  )
                  return yield* markSeen(p.humanNote.id).pipe(Effect.provideService(Actor.Actor, human))
                })
              )
            )
          )
          expect(yield* Effect.flip(operation)).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "InvalidActor" }
          })
          expect(yield* snapshot(p)).toEqual(before)
        })
      )
    )
  )

  it.effect("Seen is rebuilt from the journal through reopening and departure, and never revives pending work", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const p = yield* prepare()
              const result = yield* run(p.bound, human, markSeen(p.humanNote.id))
              const participant = (yield* p.bound.participations.listByThread(p.first.thread.id)).find(
                (p) => ThreadParticipation.memberOf(p.participant) === agent.memberId
              )
              if (!participant) return yield* Effect.die("Missing agent participation")
              yield* run(
                p.bound,
                agent,
                Effect.flatMap(ThreadParticipationService.ThreadParticipationService, (threadParticipationService) =>
                  threadParticipationService.unfollow({
                    threadId: p.first.thread.id,
                    participationId: participant.id
                  })
                )
              )
              yield* run(
                p.bound,
                p.owner,
                Effect.flatMap(MemberService.MemberService, (memberService) => memberService.remove(human.memberId))
              )
              return {
                result,
                agent: yield* notes(p.bound, agent),
                history: yield* history(p.bound)
              }
            })
          )
        )
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId)
              expect(yield* notes(bound, human)).toEqual([saved.result])
              yield* storage.discardProjections
              yield* TestClock.adjust("2 hours")
              yield* facts(
                bound,
                Effect.flatMap(Journal.Journal, (journal) => journal.replay)
              )
              expect(yield* notes(bound, human)).toEqual([saved.result])
              expect(yield* notes(bound, agent)).toEqual(saved.agent)
              expect(
                yield* bound.notifications.listPendingByRecipient(
                  Notification.ofMember(human.memberId, human.identity),
                  {
                    limit: 100
                  }
                )
              ).toEqual([])
              const live = yield* bound.checkpoints.listLive(journalLog)
              yield* facts(
                bound,
                Effect.flatMap(Journal.Journal, (journal) => journal.replay)
              )
              expect(yield* bound.checkpoints.listLive(journalLog)).toEqual(live)
              expect(yield* history(bound)).toEqual(saved.history)
            })
          )
        )
      })
    )
  )

  it.effect("direct Seen writes accept only pending human notifications here, and are atomic", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const foreign = yield* boundTo(otherWorkspaceId)
          yield* initialized(foreign)
          const discarded = changed(p.humanNote, {
            id: Notification.NotificationId.make("discarded"),
            source: { logId: Entry.LogId.make("discarded"), entryId: p.humanNote.source.entryId },
            state: { _tag: "Discarded", reason: "participation-ended" }
          })
          yield* p.bound.store.transaction(p.bound.notifications.insert(discarded))
          // Seen is never inserted; it is recorded only through markSeen.
          expect(
            yield* Effect.flip(
              p.bound.store.transaction(
                p.bound.notifications.insert(
                  changed(p.humanNote, {
                    id: Notification.NotificationId.make("inserted-seen"),
                    source: {
                      logId: Entry.LogId.make("seen"),
                      entryId: p.humanNote.source.entryId
                    },
                    state: seenState(seenAt)
                  })
                )
              )
            )
          ).toMatchObject({
            _tag: "StoreError",
            store: "NotificationStore",
            reason: { _tag: "Rejected" }
          })
          const before = yield* snapshot(p)
          const write = (bound: Bound, ids: ReadonlyArray<Notification.NotificationId>, at = seenAt) =>
            bound.store.transaction(bound.notifications.markSeen(ids, at))
          const rejected = { _tag: "StoreError", store: "NotificationStore", reason: { _tag: "Rejected" } }
          for (const id of [Notification.NotificationId.make("missing"), p.agentNote.id, discarded.id])
            // A valid ID in the same call is not recorded either.
            expect(yield* Effect.flip(write(p.bound, [p.humanNote.id, id]))).toMatchObject(rejected)
          expect(yield* Effect.flip(write(foreign, [p.humanNote.id]))).toMatchObject(rejected)
          expect(yield* snapshot(p)).toEqual(before)
          expect(yield* Effect.flip(run(p.bound, human, markSeen(discarded.id)))).toMatchObject({
            _tag: "CoreError.Conflict",
            reason: { _tag: "AlreadyHandled" }
          })
          const invalid = { at: seenAt }
          Reflect.set(invalid, "at", "not-a-date")
          expect(yield* Effect.flip(write(p.bound, [p.humanNote.id], invalid.at))).toMatchObject(rejected)
          yield* write(p.bound, [])
          yield* write(p.bound, [p.humanNote.id, p.humanNote.id])
          const result = changed(p.humanNote, { state: seenState(seenAt) })
          expect(yield* p.bound.notifications.get(p.humanNote.id)).toEqual(Option.some(result))
          // One already seen is no longer pending.
          expect(
            yield* Effect.flip(write(p.bound, [p.humanNote.id], DateTime.add(seenAt, { hours: 1 })))
          ).toMatchObject(rejected)
          expect(yield* p.bound.notifications.get(p.humanNote.id)).toEqual(Option.some(result))
          // It rolls back with its transaction, and an expired handle is refused.
          const id = p.ownerNote.id
          expect(
            yield* Effect.flip(
              p.bound.store.transaction(
                p.bound.notifications.markSeen([id], seenAt).pipe(Effect.andThen(Effect.fail("rollback")))
              )
            )
          ).toBe("rollback")
          expect(yield* p.bound.notifications.get(id)).toEqual(Option.some(p.ownerNote))
          const handle = yield* p.bound.store.transaction(Store.Transaction)
          expect(
            Exit.isFailure(
              yield* Effect.exit(
                p.bound.notifications.markSeen([id], seenAt).pipe(Effect.provideService(Store.Transaction, handle))
              )
            )
          ).toBe(true)
          expect(yield* p.bound.notifications.get(id)).toEqual(Option.some(p.ownerNote))
        })
      )
    )
  )

  it.effect("marking seen again from another host returns the one stored time, recorded once", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(runHost(storage, prepare()))
        const markOn = (adjust: `${number} seconds`) =>
          Effect.scoped(
            runHost(
              storage,
              Effect.gen(function* () {
                yield* TestClock.adjust(adjust)
                return yield* run(yield* boundTo(workspaceId), human, markSeen(saved.humanNote.id))
              })
            )
          )
        const first = yield* markOn("1 seconds")
        const second = yield* markOn("2 seconds")
        expect(second).toEqual(first)
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId)
              expect(yield* bound.notifications.get(saved.humanNote.id)).toEqual(Option.some(first))
              expect(yield* seenFacts(bound)).toEqual([saved.humanNote.id])
            })
          )
        )
      })
    )
  )

  it.effect("marking another recipient's notification seen reads as missing and writes nothing", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const p = yield* prepare()
          const before = yield* snapshot(p)
          const context = Context.add(p.bound.context, NotificationStore.NotificationStore, {
            ...p.bound.notifications,
            get: () => Effect.succeedSome(changed(p.agentNote, { id: p.humanNote.id }))
          })
          expect(yield* Effect.flip(run({ ...p.bound, context }, human, markSeen(p.humanNote.id)))).toMatchObject({
            _tag: "CoreError.NotFound"
          })
          expect(yield* snapshot(p)).toEqual(before)
        })
      )
    )
  )

  it.effect("gateway exposes marking-seen outcomes and invalid-input errors without exposing internal services", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const p = yield* Effect.scoped(runHost(storage, prepare()))
        yield* runGateway(
          storage,
          Effect.gen(function* () {
            const gateway = yield* Gateway.Gateway
            const result = yield* gateway.asMember(workspaceId, human.identity, markSeen(p.humanNote.id))
            expect(result.state._tag).toBe("Seen")
            expect(yield* gateway.asMember(workspaceId, human.identity, markSeen(p.humanNote.id))).toEqual(result)
            expect(
              yield* Effect.flip(gateway.asMember(workspaceId, p.owner.identity, markSeen(p.humanNote.id)))
            ).toMatchObject({ _tag: "CoreError.NotFound" })
            expect(
              yield* Effect.flip(gateway.asMember(workspaceId, agent.identity, markSeen(p.agentNote.id)))
            ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "HumanRequired" } })
            const invalid = { id: p.humanNote.id }
            Reflect.set(invalid, "id", "")
            expect(
              yield* Effect.flip(gateway.asMember(workspaceId, human.identity, markSeen(invalid.id)))
            ).toMatchObject({ _tag: "CoreError.Invalid", reason: { _tag: "Malformed" } })
          })
        )
      })
    )
  )
})

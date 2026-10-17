import { Assignment, AssignmentFacts, BuiltinRoles } from "@amends-dev/core/authorization"
import { Group, GroupService, GroupStore, GroupMembershipStore } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Entry, Journal, Publication } from "@amends-dev/core/journal"
import { Notification, NotificationStore } from "@amends-dev/core/notification"
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipation,
  ThreadParticipationService,
  ThreadStore,
  ThreadParticipationStore,
  ThreadMessageStore,
  ThreadActivityStore,
  ThreadCommand,
  ThreadId,
  ThreadMessageId
} from "@amends-dev/core/thread"
import { Member, MemberFacts, MemberStore, MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Option, Context } from "effect"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import {
  type Bound,
  boundTo,
  listOldestFirst,
  runHost,
  testProvenance,
  threadInternals,
  workspaceId
} from "./support.ts"

/** Thread starts and replies make the same store reads at any group size. */

const { core, initialized } = Support
describe("thread starts", () => {
  const humanId = MemberId.MemberId.make("human")
  const otherId = MemberId.MemberId.make("other")
  const contactId = Identity.ContactId.make("customer")
  const run = <A, E, R>(bound: Bound, actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
    program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(core(bound)))
  const trusted = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
    program.pipe(
      Effect.provideService(Publication.Publication, testProvenance(bound.store.workspaceId)),
      Effect.provide(threadInternals.pipe(Layer.provideMerge(core(bound))))
    )
  const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 200 })
  const startDirect = (memberIds: ReadonlyArray<MemberId.MemberId>, mentions: ReadonlyArray<MemberId.MemberId> = []) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.startDirect({ memberIds, text: "Hello", mentions })
    )
  const participantsOf = (bound: Bound, threadId: ThreadId.ThreadId) =>
    Effect.map(bound.participations.listByThread(threadId), (records) =>
      records.map((record) => ThreadParticipation.referenceOf(record.participant))
    )
  const inbox = (bound: Bound, recipient: Notification.Recipient) =>
    listOldestFirst(bound.notifications, recipient, { limit: 100 })
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId)
    const workspace = yield* initialized(bound)
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy }
    })
    yield* trusted(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          // Members join with the Viewer role, as invitation acceptance grants it.
          Effect.forEach([humanId, otherId], (memberId) =>
            Effect.andThen(
              journal.publish(MemberFacts.Added, {
                workspaceId,
                memberId,
                identity: { _tag: "Human", id: Identity.HumanId.make(memberId) },
                name: Member.Name.make(memberId)
              }),
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.AssignmentId.make(`viewer-${memberId}`),
                memberId,
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
    return { bound, owner }
  })

  /** Records a read returned: each element of a list, or one for a found record. */
  const sizeOf = (result: unknown) =>
    globalThis.Array.isArray(result) ? result.length : Option.isOption(result) ? (Option.isSome(result) ? 1 : 0) : 1
  /**
   * Wrap a store so every read method call is counted under `name.method`, with the records it
   * returned; writes pass through.
   */
  const countReads = <S extends object>(
    name: string,
    store: S,
    counts: Map<string, number>,
    rows: Map<string, number>
  ): S =>
    Object.fromEntries(
      Object.entries(store).map(([method, value]) => [
        method,
        typeof value === "function" && /^(get|list|find|latest|read|page)/.test(method)
          ? (...args: ReadonlyArray<unknown>) => {
              const key = `${name}.${method}`
              counts.set(key, (counts.get(key) ?? 0) + 1)
              return (value(...args) as Effect.Effect<unknown, unknown, unknown>).pipe(
                Effect.tap((result) => Effect.sync(() => rows.set(key, (rows.get(key) ?? 0) + sizeOf(result))))
              )
            }
          : value
      ])
    ) as S
  /** The binding with its record stores counted, and ways to take and reset the counts. */
  const countingReads = (bound: Bound) => {
    const counts = new Map<string, number>()
    const rows = new Map<string, number>()
    const context = Context.mergeAll(
      bound.context,
      Context.make(MemberStore.MemberStore, countReads("members", bound.members, counts, rows)),
      Context.make(GroupStore.GroupStore, countReads("groups", bound.groups, counts, rows)),
      Context.make(
        GroupMembershipStore.GroupMembershipStore,
        countReads("groupMemberships", bound.groupMemberships, counts, rows)
      ),
      Context.make(ThreadStore.ThreadStore, countReads("threads", bound.threads, counts, rows)),
      Context.make(
        ThreadParticipationStore.ThreadParticipationStore,
        countReads("participations", bound.participations, counts, rows)
      ),
      Context.make(ThreadMessageStore.ThreadMessageStore, countReads("messages", bound.messages, counts, rows)),
      Context.make(ThreadActivityStore.ThreadActivityStore, countReads("activities", bound.activities, counts, rows)),
      Context.make(NotificationStore.NotificationStore, countReads("notifications", bound.notifications, counts, rows))
    )
    const drain = (map: Map<string, number>) => {
      const taken = Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : 1)))
      map.clear()
      return taken
    }
    const take = () => {
      rows.clear()
      return drain(counts)
    }
    /** The records each read returned since the last take. */
    const takeRows = () => {
      counts.clear()
      return drain(rows)
    }
    return { bound: { ...bound, context }, take, takeRows }
  }

  it.effect("starting a direct group reuses it for the same members and enrolls all of them", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare()
          const first = yield* run(bound, owner, startDirect([humanId]))
          const group = Option.getOrThrow(yield* bound.groups.get(first.thread.groupId))
          expect(group).toMatchObject({
            kind: "Direct",
            memberIds: Group.directMembers([owner.memberId, humanId]),
            createdBy: owner.memberId
          })
          expect(first.thread.createdBy).toEqual({ _tag: "Member", memberId: owner.memberId })
          expect(yield* participantsOf(bound, first.thread.id)).toEqual(
            expect.arrayContaining([
              { _tag: "Member", memberId: owner.memberId },
              { _tag: "Member", memberId: humanId }
            ])
          )
          // The same members, in any order and including the author, reuse the group.
          const human = Actor.Actor.of({
            workspaceId,
            memberId: humanId,
            identity: { _tag: "Human", id: Identity.HumanId.make(humanId) }
          })
          const again = yield* run(bound, human, startDirect([owner.memberId, humanId]))
          expect(again.thread.groupId).toBe(group.id)
          expect(again.thread.id).not.toBe(first.thread.id)
          const trio = yield* run(bound, owner, startDirect([otherId, humanId]))
          expect(trio.thread.groupId).not.toBe(group.id)
          // A thread in a direct group enrolls all members; mentions only narrow notification.
          const humanInbox = (yield* inbox(bound, Notification.ofMember(human.memberId, human.identity))).length
          const ownerInbox = (yield* inbox(bound, Notification.ofMember(owner.memberId, owner.identity))).length
          const mentioned = yield* run(
            bound,
            owner,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startInGroup({
                groupId: trio.thread.groupId,
                text: "Just Bob",
                mentions: [humanId]
              })
            )
          )
          expect(yield* participantsOf(bound, mentioned.thread.id)).toHaveLength(3)
          expect(yield* inbox(bound, Notification.ofMember(human.memberId, human.identity))).toHaveLength(
            humanInbox + 1
          )
          expect(yield* inbox(bound, Notification.ofMember(owner.memberId, owner.identity))).toHaveLength(ownerInbox)
          // Direct groups need another member, and every member must be available.
          const before = yield* history(bound)
          expect(yield* Effect.flip(run(bound, owner, startDirect([owner.memberId])))).toMatchObject({
            _tag: "CoreError.Invalid",
            reason: { _tag: "DirectMembersRequired" }
          })
          expect(yield* Effect.flip(run(bound, owner, startDirect([MemberId.MemberId.make("missing")])))).toMatchObject(
            {
              _tag: "CoreError.Conflict",
              reason: { _tag: "ParticipantUnavailable", memberId: "missing" }
            }
          )
          expect(yield* Effect.flip(run(bound, owner, startDirect([humanId], [otherId])))).toMatchObject({
            _tag: "CoreError.Conflict",
            reason: { _tag: "ParticipantUnavailable", memberId: otherId }
          })
          expect(yield* history(bound)).toEqual(before)
        })
      )
    )
  )

  it.effect("the shared start opens a contact's conversation with contact and triage participants only", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare()
          const team = yield* run(
            bound,
            owner,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({
                name: "Support",
                memberIds: [owner.memberId, humanId]
              })
            )
          )
          const contact: Notification.Recipient = { _tag: "Contact", id: contactId }
          const started = yield* trusted(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.flatMap(ThreadCommand.ThreadCommand, (threadCommand) =>
                  Effect.flatMap(DateTime.now, (occurredAt) =>
                    threadCommand.create({
                      threadId: ThreadId.ThreadId.make("late-order"),
                      groupId: team.id,
                      title: null,
                      origin: null,
                      participants: [{ _tag: "Contact", contactId }, { _tag: "Triage" }],
                      message: {
                        messageId: ThreadMessageId.ThreadMessageId.make("late-order-opening"),
                        author: { _tag: "Contact", contactId },
                        text: "My order is late",
                        mentions: [],
                        via: null
                      },
                      occurredAt
                    })
                  )
                )
              )
            )
          )
          expect(started.thread.createdBy).toEqual({ _tag: "Contact", contactId })
          expect(started.message.author).toEqual({ _tag: "Contact", contactId })
          expect(yield* participantsOf(bound, started.thread.id)).toEqual(
            expect.arrayContaining([{ _tag: "Contact", contactId }, { _tag: "Triage" }])
          )
          expect(yield* participantsOf(bound, started.thread.id)).toHaveLength(2)
          // The contact is not sent their own message; triage is notified.
          expect(yield* inbox(bound, contact)).toEqual([])
          expect(yield* inbox(bound, { _tag: "Triage" })).toHaveLength(1)
          expect(yield* inbox(bound, Notification.ofMember(owner.memberId, owner.identity))).toEqual([])
          // A member reply without mentions reaches every participant, including the contact.
          yield* run(
            bound,
            owner,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({
                threadId: started.thread.id,
                text: "Looking into it",
                mentions: []
              })
            )
          )
          expect(yield* inbox(bound, contact)).toHaveLength(1)
          expect(yield* inbox(bound, { _tag: "Triage" })).toHaveLength(2)
          expect(yield* inbox(bound, Notification.ofMember(owner.memberId, owner.identity))).toEqual([])
          // Mentions narrow a reply to the mentioned members.
          yield* run(
            bound,
            owner,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({
                threadId: started.thread.id,
                text: "Bob?",
                mentions: [humanId]
              })
            )
          )
          expect(yield* inbox(bound, contact)).toHaveLength(1)
          expect(
            yield* inbox(
              bound,
              Notification.ofMember(humanId, {
                _tag: "Human",
                id: Identity.HumanId.make(humanId)
              })
            )
          ).toHaveLength(1)
        })
      )
    )
  )

  it.effect("group creation, starts, replies, and timelines read storage the same way at any size", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare()
          const extra = Array.from({ length: 10 }, (_, index) => MemberId.MemberId.make(`member-${index}`))
          yield* trusted(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.forEach(extra, (memberId) =>
                  journal.publish(MemberFacts.Added, {
                    workspaceId,
                    memberId,
                    identity: { _tag: "Human", id: Identity.HumanId.make(memberId) },
                    name: Member.Name.make(memberId)
                  })
                )
              )
            )
          )
          const counted = countingReads(bound)
          const measure = Effect.fnUntraced(function* (size: number) {
            counted.take()
            const team = yield* run(
              counted.bound,
              owner,
              Effect.flatMap(GroupService.GroupService, (groupService) =>
                groupService.createTeam({
                  name: `Team ${size}`,
                  memberIds: [owner.memberId, ...extra.slice(0, size)]
                })
              )
            )
            const create = counted.take()
            const started = yield* run(
              counted.bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                // Mentioning the members enrolls them, so the participants grow with the group.
                threadService.startInGroup({
                  groupId: team.id,
                  text: "Hello",
                  mentions: extra.slice(0, size)
                })
              )
            )
            const start = counted.take()
            const reply = Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({
                threadId: started.thread.id,
                text: "Reply",
                mentions: []
              })
            )
            yield* run(counted.bound, owner, reply)
            const replied = counted.take()
            // A longer timeline for the larger group: its page must not read per item either.
            for (let index = 0; index < size; index++) yield* run(bound, owner, reply)
            counted.take()
            const page = yield* run(
              counted.bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.readTimeline(started.thread.id, { limit: 50 })
              )
            )
            expect(page).toHaveLength(size + 2)
            return { create, start, replied, timeline: counted.take() }
          })
          const small = yield* measure(1)
          const large = yield* measure(10)
          expect(large).toEqual(small)
          expect(small.replied).toMatchObject({ "members.getMany": expect.any(Number) })
        })
      )
    )
  )

  it.effect("a reply reads the records of those it addresses, not the group's roster or the thread's history", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare()
          const extra = Array.from({ length: 10 }, (_, index) => MemberId.MemberId.make(`member-${index}`))
          yield* trusted(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.forEach(extra, (memberId) =>
                  journal.publish(MemberFacts.Added, {
                    workspaceId,
                    memberId,
                    identity: { _tag: "Human", id: Identity.HumanId.make(memberId) },
                    name: Member.Name.make(memberId)
                  })
                )
              )
            )
          )
          const as = (memberId: MemberId.MemberId) =>
            Actor.Actor.of({
              workspaceId,
              memberId,
              identity: { _tag: "Human", id: Identity.HumanId.make(memberId) }
            })
          const reply = (threadId: ThreadId.ThreadId, mentions: ReadonlyArray<MemberId.MemberId>) =>
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({ threadId, text: "Reply", mentions })
            )
          const counted = countingReads(bound)
          const measure = Effect.fnUntraced(function* (size: number) {
            const team = yield* run(
              bound,
              owner,
              Effect.flatMap(GroupService.GroupService, (groupService) =>
                groupService.createTeam({
                  name: `Team ${size}`,
                  memberIds: [owner.memberId, ...extra.slice(0, size)]
                })
              )
            )
            const started = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.startInGroup({
                  groupId: team.id,
                  text: "Hello",
                  mentions: extra.slice(0, size)
                })
              )
            )
            // All but the first mentioned leave the thread again: the larger group's thread
            // keeps their ended participations, and the group keeps every member.
            for (const memberId of extra.slice(1, size)) {
              const own = (yield* bound.participations.listByThread(started.thread.id)).find(
                (p) => ThreadParticipation.memberOf(p.participant) === memberId
              )
              if (own === undefined) return yield* Effect.die("Missing participation")
              yield* run(
                bound,
                as(memberId),
                Effect.flatMap(ThreadParticipationService.ThreadParticipationService, (threadParticipationService) =>
                  threadParticipationService.unfollow({
                    threadId: started.thread.id,
                    participationId: own.id
                  })
                )
              )
            }
            counted.takeRows()
            yield* run(counted.bound, owner, reply(started.thread.id, []))
            const everyone = counted.takeRows()
            yield* run(counted.bound, owner, reply(started.thread.id, extra.slice(0, 1)))
            const mentioning = counted.takeRows()
            return { everyone, mentioning }
          })
          const small = yield* measure(1)
          const large = yield* measure(10)
          expect(large).toEqual(small)
          // Addressing everyone reads the two current participants, and only them.
          expect(small.everyone).toMatchObject({ "participations.pageActiveByThread": 2 })
        })
      )
    )
  )
})

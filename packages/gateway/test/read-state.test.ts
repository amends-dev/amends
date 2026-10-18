import { Assignment, AssignmentFacts, BuiltinRoles, Grant } from "@amends-dev/core/authorization"
import { CoreError } from "@amends-dev/core/error"
import { type Group, GroupService, GroupFollowService, GroupMembershipService, GroupId } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Journal, Publication } from "@amends-dev/core/journal"
import { Notification, NotificationService } from "@amends-dev/core/notification"
import { ReadStateService } from "@amends-dev/core/read-state"
import {
  type Thread,
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
  ThreadPermissions,
  ThreadId
} from "@amends-dev/core/thread"
import { Member, MemberFacts, MemberId } from "@amends-dev/core/workspace"
import { Entry } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Tracer } from "effect"
import { TestClock } from "effect/testing"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { type Bound, boundTo, otherWorkspaceId, placed, runHost, testProvenance, workspaceId } from "./support.ts"

/** Thread and group lists with unread state, forward-only read state, and settling on reading. */

const { core, initialized } = Support
describe("read state", () => {
  const humanId = MemberId.MemberId.make("human")
  const otherId = MemberId.MemberId.make("other")
  const plainId = MemberId.MemberId.make("plain")
  const outsiderId = MemberId.MemberId.make("outsider")
  const agentId = MemberId.MemberId.make("agent")
  const identityOf = (memberId: MemberId.MemberId): Identity.MemberReference =>
    memberId === agentId
      ? { _tag: "Agent", id: Identity.AgentId.make(memberId) }
      : { _tag: "Human", id: Identity.HumanId.make(memberId) }
  const actorFor = (memberId: MemberId.MemberId) =>
    Actor.Actor.of({ workspaceId, memberId, identity: identityOf(memberId) })
  const run = <A, E, R>(bound: Bound, actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
    program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(core(bound)))
  const trusted = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
    program.pipe(
      Effect.provideService(Publication.Publication, testProvenance(bound.workspaceId)),
      Effect.provide(core(bound))
    )
  const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 500 })
  const start = (groupId: GroupId.GroupId, mentions: ReadonlyArray<MemberId.MemberId>) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.startInGroup({ groupId, text: "Opening", mentions })
    ).pipe(Effect.flatMap(placed))
  const reply = (threadId: ThreadId.ThreadId, mentions: ReadonlyArray<MemberId.MemberId>) =>
    Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
      threadMessageService.publish({ threadId, text: "Reply", mentions })
    ).pipe(Effect.flatMap((message) => placed({ message })))
  const markRead = (threadId: ThreadId.ThreadId, throughSequence: number) =>
    Effect.flatMap(ReadStateService.ReadStateService, (readStateService) =>
      readStateService.markThreadRead({ threadId, throughSequence })
    )
  const markGroupRead = (groupId: GroupId.GroupId) =>
    Effect.flatMap(ReadStateService.ReadStateService, (readStateService) => readStateService.markGroupRead({ groupId }))
  const pending = (bound: Bound, memberId: MemberId.MemberId) =>
    Effect.map(
      bound.notifications.listPendingByRecipient(Notification.ofMember(memberId, identityOf(memberId)), { limit: 100 }),
      (records) => records.map((record) => record.thread?.sequence ?? 0).toSorted((a, b) => a - b)
    )
  const positionOf = (bound: Bound, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId) =>
    Effect.map(bound.readStates.getThreadPositions(memberId, [threadId]), (positions) =>
      positions.map((position) => position.readThrough)
    )
  /**
   * A team of the owner, two Viewers (`human`, `other`), a member with no role (`plain`), and an
   * agent; and a Viewer outside the team.
   */
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
          Effect.forEach([humanId, otherId, plainId, outsiderId, agentId], (memberId) =>
            Effect.andThen(
              journal.publish(MemberFacts.Added, {
                workspaceId,
                memberId,
                identity: identityOf(memberId),
                name: Member.Name.make(memberId)
              }),
              memberId === plainId || memberId === agentId
                ? Effect.void
                : journal.publish(AssignmentFacts.Created, {
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
    const team = yield* run(
      bound,
      owner,
      Effect.flatMap(GroupService.GroupService, (groupService) =>
        groupService.createTeam({
          name: "Team",
          memberIds: [owner.memberId, humanId, otherId, plainId, agentId]
        })
      )
    )
    return { bound, owner, team }
  })

  it.effect("messages advance a thread's and group's latest activity; quiet changes do not", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare()
          yield* TestClock.adjust("1 minute")
          const started = yield* run(bound, owner, start(team.id, [humanId]))
          const opened = yield* DateTime.now
          expect(yield* bound.threads.getLatest([started.thread.id])).toEqual([
            { threadId: started.thread.id, sequence: 1, occurredAt: opened }
          ])
          expect(yield* bound.groups.getLatest([team.id])).toEqual([{ groupId: team.id, occurredAt: opened }])
          // Following records quiet activity at sequence 2, which is not new content.
          yield* TestClock.adjust("1 minute")
          yield* run(
            bound,
            actorFor(otherId),
            Effect.flatMap(ThreadParticipationService.ThreadParticipationService, (threadParticipationService) =>
              threadParticipationService.follow(started.thread.id)
            )
          )
          expect(yield* bound.threads.getLatest([started.thread.id])).toMatchObject([{ sequence: 1 }])
          yield* TestClock.adjust("1 minute")
          yield* run(bound, owner, reply(started.thread.id, [humanId]))
          const replied = yield* DateTime.now
          expect(yield* bound.threads.getLatest([started.thread.id])).toEqual([
            { threadId: started.thread.id, sequence: 3, occurredAt: replied }
          ])
          expect(yield* bound.groups.getLatest([team.id])).toEqual([{ groupId: team.id, occurredAt: replied }])
          // Earlier positions and times change nothing; missing records conflict.
          yield* bound.store.transaction(
            Effect.andThen(
              bound.threads.recordLatest({
                threadId: started.thread.id,
                sequence: 2,
                occurredAt: opened
              }),
              bound.groups.recordLatest({ groupId: team.id, occurredAt: opened })
            )
          )
          expect(yield* bound.threads.getLatest([started.thread.id])).toMatchObject([{ sequence: 3 }])
          expect(yield* bound.groups.getLatest([team.id])).toEqual([{ groupId: team.id, occurredAt: replied }])
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                bound.threads.recordLatest({
                  threadId: ThreadId.ThreadId.make("missing"),
                  sequence: 1,
                  occurredAt: opened
                })
              )
            )
          ).toMatchObject({
            _tag: "StoreError",
            store: "ThreadStore",
            reason: { _tag: "Rejected" }
          })
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                bound.groups.recordLatest({
                  groupId: GroupId.GroupId.make("missing"),
                  occurredAt: opened
                })
              )
            )
          ).toMatchObject({
            _tag: "StoreError",
            store: "GroupStore",
            reason: { _tag: "Rejected" }
          })
          expect(yield* bound.threads.getLatest([started.thread.id, ThreadId.ThreadId.make("missing")])).toHaveLength(1)
          expect(yield* bound.threads.getLatest([])).toEqual([])
          expect(yield* bound.groups.getLatest([])).toEqual([])
        })
      )
    )
  )

  it.effect("marking a thread read moves forward only and settles the reader's inbox up to it", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare()
          const human = actorFor(humanId)
          const started = yield* run(bound, owner, start(team.id, [humanId]))
          const threadId = started.thread.id
          yield* run(bound, owner, reply(threadId, [humanId]))
          yield* run(bound, owner, reply(threadId, [humanId]))
          expect(yield* pending(bound, humanId)).toEqual([1, 2, 3])
          const before = yield* history(bound)
          yield* run(bound, human, markRead(threadId, 2))
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([2])
          expect(yield* pending(bound, humanId)).toEqual([3])
          // Reading records one fact, in a commit of its own.
          const marked = yield* history(bound)
          expect(marked).toHaveLength(before.length + 1)
          expect(marked.at(-1)?.entries).toHaveLength(1)
          // An earlier position changes nothing, and records nothing.
          yield* run(bound, human, markRead(threadId, 1))
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([2])
          expect(yield* pending(bound, humanId)).toEqual([3])
          expect(yield* history(bound)).toEqual(marked)
          expect(yield* Effect.flip(run(bound, human, markRead(threadId, 4)))).toEqual(
            new CoreError.Conflict({
              reason: new CoreError.BeyondTimeline({
                threadId,
                throughSequence: 4,
                latestSequence: 3
              })
            })
          )
          yield* run(bound, human, markRead(threadId, 3))
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([3])
          expect(yield* pending(bound, humanId)).toEqual([])
          // A member reading a thread they take no part in keeps only a position.
          yield* run(bound, actorFor(otherId), markRead(threadId, 3))
          expect(yield* positionOf(bound, otherId, threadId)).toEqual([3])
          // Only people with current read access keep read state.
          expect(yield* Effect.flip(run(bound, actorFor(agentId), markRead(threadId, 1)))).toEqual(
            new CoreError.Denied({ reason: new CoreError.HumanRequired() })
          )
          expect(yield* Effect.flip(run(bound, actorFor(outsiderId), markRead(threadId, 1)))).toEqual(
            new CoreError.NotFound({ resource: "Thread", id: threadId })
          )
          expect(yield* Effect.flip(run(bound, actorFor(plainId), markRead(threadId, 1)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          expect(yield* positionOf(bound, plainId, threadId)).toEqual([])
        })
      )
    )
  )

  it.effect("marking a group read records a read time that only moves forward", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, team } = yield* prepare()
          const human = actorFor(humanId)
          const readTimes = Effect.map(bound.readStates.getGroupReads(humanId, [team.id]), (times) =>
            times.map((time) => time.readAt)
          )
          yield* TestClock.adjust("1 minute")
          yield* run(bound, human, markGroupRead(team.id))
          const first = yield* DateTime.now
          expect(yield* readTimes).toEqual([first])
          yield* TestClock.adjust("1 minute")
          yield* run(bound, human, markGroupRead(team.id))
          const second = yield* DateTime.now
          expect(yield* readTimes).toEqual([second])
          yield* bound.store.transaction(
            bound.readStates.advanceGroup({
              workspaceId,
              memberId: humanId,
              groupId: team.id,
              readAt: first
            })
          )
          expect(yield* readTimes).toEqual([second])
          expect(yield* Effect.flip(run(bound, actorFor(agentId), markGroupRead(team.id)))).toEqual(
            new CoreError.Denied({ reason: new CoreError.HumanRequired() })
          )
          expect(yield* Effect.flip(run(bound, actorFor(outsiderId), markGroupRead(team.id)))).toEqual(
            new CoreError.NotFound({ resource: "Group", id: team.id })
          )
        })
      )
    )
  )

  it.effect("read state is recorded in the journal, so rebuilding projections restores it", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare()
          const human = actorFor(humanId)
          const started = yield* run(bound, owner, start(team.id, []))
          const threadId = started.thread.id
          yield* run(bound, human, markRead(threadId, 1))
          yield* run(bound, human, markGroupRead(team.id))
          const groupTimes = Effect.map(bound.readStates.getGroupReads(humanId, [team.id]), (times) =>
            times.map((time) => time.readAt)
          )
          const readAt = yield* groupTimes
          expect(readAt).toHaveLength(1)
          yield* storage.discardProjections
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([])
          yield* trusted(
            bound,
            Effect.flatMap(Journal.Journal, (journal) => journal.replay)
          )
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([1])
          // The author read it through their own message.
          expect(yield* positionOf(bound, owner.memberId, threadId)).toEqual([1])
          expect(yield* groupTimes).toEqual(readAt)
          // Positions are per member and per workspace.
          expect(yield* positionOf(bound, otherId, threadId)).toEqual([])
          expect(yield* bound.readStates.getThreadPositions(humanId, [])).toEqual([])
          const foreign = yield* boundTo(otherWorkspaceId)
          expect(yield* foreign.readStates.getThreadPositions(humanId, [threadId])).toEqual([])
        })
      )
    )
  )

  it.effect("group thread lists page by latest activity with each reader's unread state", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare()
          const human = actorFor(humanId)
          const listed = (actor: Actor.Actor["Service"], options: Thread.ListOptions) =>
            run(
              bound,
              actor,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.listInGroup(team.id, options)
              )
            )
          yield* TestClock.adjust("1 minute")
          const first = yield* run(bound, owner, start(team.id, []))
          yield* TestClock.adjust("1 minute")
          const second = yield* run(bound, owner, start(team.id, []))
          yield* TestClock.adjust("1 minute")
          // Posting reads the thread through the author's own message.
          const own = yield* run(bound, human, start(team.id, []))
          const page = yield* listed(human, { limit: 2 })
          expect(page.map((item) => [item.thread.id, item.unread, item.readThrough])).toEqual([
            [own.thread.id, false, 1],
            [second.thread.id, true, null]
          ])
          const last = page[1]
          if (last === undefined) return yield* Effect.die("Missing page item")
          const next = yield* listed(human, {
            before: { latestActivityAt: last.latest.occurredAt, threadId: last.thread.id },
            limit: 2
          })
          expect(next.map((item) => item.thread.id)).toEqual([first.thread.id])
          // Reading clears unread; a later message moves the thread first and makes it unread again.
          yield* run(bound, human, markRead(second.thread.id, 1))
          yield* TestClock.adjust("1 minute")
          yield* run(bound, owner, reply(first.thread.id, []))
          expect((yield* listed(human, { limit: 10 })).map((item) => [item.thread.id, item.unread])).toEqual([
            [first.thread.id, true],
            [own.thread.id, false],
            [second.thread.id, false]
          ])
          // A member who joins later sees earlier activity as read until something new arrives.
          yield* TestClock.adjust("1 minute")
          yield* run(
            bound,
            owner,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.add({ groupId: team.id, memberId: outsiderId })
            )
          )
          const outsider = actorFor(outsiderId)
          expect((yield* listed(outsider, { limit: 10 })).some((item) => item.unread)).toBe(false)
          yield* TestClock.adjust("1 minute")
          yield* run(bound, owner, reply(second.thread.id, []))
          expect((yield* listed(outsider, { limit: 10 })).filter((item) => item.unread).length).toBe(1)
          // Threads the reader's grants do not cover are skipped, and the page still fills.
          const plain = actorFor(plainId)
          expect(yield* listed(plain, { limit: 1 })).toEqual([])
          yield* trusted(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.AssignmentId.make("plain-reads-own"),
                memberId: plainId,
                source: {
                  _tag: "Direct",
                  grant: Grant.make(ThreadPermissions.Read, {
                    _tag: "Target",
                    target: { _tag: "Thread", workspaceId, threadId: own.thread.id }
                  })
                }
              })
            )
          )
          expect((yield* listed(plain, { limit: 1 })).map((item) => item.thread.id)).toEqual([own.thread.id])
          expect(
            yield* Effect.flip(
              run(
                bound,
                actorFor(outsiderId),
                Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                  threadService.listInGroup(GroupId.GroupId.make("missing"), { limit: 1 })
                )
              )
            )
          ).toMatchObject({ _tag: "CoreError.NotFound" })
        })
      )
    )
  )

  it.effect("group streams page threads by start with their opening, replies, and unread state", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare()
          const human = actorFor(humanId)
          const stream = (actor: Actor.Actor["Service"], options: Thread.OpeningOptions) =>
            run(
              bound,
              actor,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.listOpenings(team.id, options)
              )
            )
          yield* TestClock.adjust("1 minute")
          const first = yield* run(bound, owner, start(team.id, []))
          yield* TestClock.adjust("1 minute")
          const second = yield* run(bound, owner, start(team.id, []))
          yield* TestClock.adjust("1 minute")
          // Posting reads the thread through the author's own message.
          const own = yield* run(bound, human, start(team.id, []))
          // A reply counts and moves the latest message; its thread keeps its place in the stream.
          yield* TestClock.adjust("1 minute")
          const answer = yield* run(bound, owner, reply(first.thread.id, []))
          const page = yield* stream(human, { limit: 2 })
          expect(page.map((item) => [item.thread.id, item.message, item.replies, item.unread])).toEqual([
            [own.thread.id, own.message, 0, false],
            [second.thread.id, second.message, 0, true]
          ])
          const last = page[1]
          if (last === undefined) return yield* Effect.die("Missing page item")
          const next = yield* stream(human, {
            before: { createdAt: last.thread.createdAt, threadId: last.thread.id },
            limit: 2
          })
          expect(next).toEqual([
            {
              thread: first.thread,
              task: null,
              message: first.message,
              replies: 1,
              latest: {
                threadId: first.thread.id,
                sequence: answer.activity.sequence,
                occurredAt: answer.activity.occurredAt
              },
              readThrough: null,
              unread: true
            }
          ])
          // Latest-activity order puts the replied thread first; the stream does not.
          const recent = yield* run(
            bound,
            human,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.listInGroup(team.id, { limit: 1 })
            )
          )
          expect(recent.map((item) => item.thread.id)).toEqual([first.thread.id])
          yield* run(bound, human, markRead(first.thread.id, answer.activity.sequence))
          expect((yield* stream(human, { limit: 10 })).map((item) => [item.thread.id, item.unread])).toEqual([
            [own.thread.id, false],
            [second.thread.id, true],
            [first.thread.id, false]
          ])
          // Without a read grant nothing shows, and a group outside the reader's is missing.
          expect(yield* stream(actorFor(plainId), { limit: 10 })).toEqual([])
          expect(
            yield* Effect.flip(
              run(
                bound,
                actorFor(outsiderId),
                Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                  threadService.listOpenings(team.id, { limit: 1 })
                )
              )
            )
          ).toMatchObject({ _tag: "CoreError.NotFound" })
        })
      )
    )
  )

  it.effect("a stream page reads storage a fixed number of times, however many threads", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare()
          // Count store reads by store and operation. The PostgreSQL adapter names its spans after
          // its modules, such as `Threads.listByStart`, and the memory stores after their
          // contracts, such as `ThreadStore.memory.listByStart`.
          const modules: Record<string, string> = {
            ThreadStore: "Threads",
            TaskStore: "Tasks",
            ThreadActivityStore: "ThreadActivities",
            ThreadMessageStore: "ThreadMessages",
            ReadStateStore: "ReadStates"
          }
          const readOf = (name: string) => {
            const memory = /^(\w+)\.memory\.(\w+)$/.exec(name)
            const read = memory ? `${modules[memory[1]!] ?? memory[1]}.${memory[2]}` : name
            return /^(Threads|Tasks|ThreadActivities|ThreadMessages|ReadStates)\./.test(read) ? read : undefined
          }
          const reads = Effect.fnUntraced(function* () {
            const counts = new Map<string, number>()
            const items = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.listOpenings(team.id, { limit: 50 })
              )
            ).pipe(
              Effect.withTracer(
                Tracer.make({
                  span(options) {
                    const read = readOf(options.name)
                    if (read !== undefined) counts.set(read, (counts.get(read) ?? 0) + 1)
                    return Tracer.nativeTracer.span(options)
                  }
                })
              )
            )
            return { items: items.length, counts: Object.fromEntries(counts) }
          })
          const thread = yield* run(bound, owner, start(team.id, []))
          yield* run(bound, owner, reply(thread.thread.id, []))
          const small = yield* reads()
          for (let index = 0; index < 6; index++) {
            const started = yield* run(bound, owner, start(team.id, []))
            yield* run(bound, owner, reply(started.thread.id, []))
          }
          const large = yield* reads()
          expect([small.items, large.items]).toEqual([1, 7])
          expect(large.counts).toEqual(small.counts)
          expect(small.counts).toMatchObject({
            "Threads.listByStart": 1,
            "Tasks.getMany": 1,
            "ThreadActivities.getFirst": 1,
            "ThreadMessages.countByThread": 1,
            "ThreadMessages.getMany": 1
          })
        })
      )
    )
  )

  it.effect(
    "group lists report latest activity, catching up, and following; counts report what is pending in each",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, team } = yield* prepare()
            const human = actorFor(humanId)
            const mine = (actor: Actor.Actor["Service"]) =>
              run(
                bound,
                actor,
                Effect.flatMap(GroupService.GroupService, (groupService) => groupService.listMine({ limit: 100 }))
              )
            const quiet = yield* run(
              bound,
              owner,
              Effect.flatMap(GroupService.GroupService, (groupService) =>
                groupService.createTeam({
                  name: "Quiet",
                  memberIds: [owner.memberId, humanId]
                })
              )
            )
            const itemOf = (items: ReadonlyArray<Group.ListItem>, groupId: GroupId.GroupId) =>
              items.find((item) => item.group.id === groupId)
            const pendingOf = (actor: Actor.Actor["Service"]) =>
              run(
                bound,
                actor,
                Effect.map(
                  Effect.flatMap(
                    NotificationService.NotificationService,
                    (notificationService) => notificationService.countPending
                  ),
                  (counts) => Object.fromEntries(counts.groups.map(({ groupId, count }) => [groupId, count]))
                )
              )
            yield* TestClock.adjust("1 minute")
            yield* run(bound, owner, start(team.id, []))
            const posted = yield* DateTime.now
            const listed = yield* mine(human)
            expect(listed.map((item) => item.group.id)).toEqual(
              [team.id, quiet.id].toSorted((a, b) => (a < b ? -1 : 1))
            )
            // Unread activity that addressed nobody leaves nothing pending.
            expect(itemOf(listed, team.id)).toMatchObject({
              latestActivityAt: posted,
              readAt: null,
              newActivity: true,
              following: false
            })
            expect(yield* pendingOf(human)).toEqual({})
            expect(itemOf(listed, quiet.id)).toMatchObject({
              latestActivityAt: null,
              newActivity: false
            })
            yield* TestClock.adjust("1 minute")
            yield* run(bound, human, markGroupRead(team.id))
            yield* run(
              bound,
              human,
              Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
                groupFollowService.follow({ groupId: team.id, memberId: humanId })
              )
            )
            expect(itemOf(yield* mine(human), team.id)).toMatchObject({
              readAt: yield* DateTime.now,
              newActivity: false,
              following: true
            })
            yield* TestClock.adjust("1 minute")
            // Following joins the new thread, so its opening and a reply notify the reader.
            const followed = yield* run(bound, owner, start(team.id, []))
            yield* run(bound, owner, reply(followed.thread.id, []))
            yield* run(bound, owner, start(quiet.id, [humanId]))
            expect(itemOf(yield* mine(human), team.id)).toMatchObject({ newActivity: true })
            expect(yield* pendingOf(human)).toEqual({ [team.id]: 2, [quiet.id]: 1 })
            // Reading the thread settles its notifications; the other group's stay pending.
            yield* run(bound, human, markRead(followed.thread.id, 2))
            expect(yield* pendingOf(human)).toEqual({ [quiet.id]: 1 })
            expect(yield* pendingOf(owner)).toEqual({})
            // Groups outside the reader's group.read grants are left out.
            expect(yield* mine(actorFor(plainId))).toEqual([])
          })
        )
      )
  )

  it.effect("posting reads the thread through the author's message and settles their earlier notifications", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare()
          const started = yield* run(bound, owner, start(team.id, [humanId]))
          yield* run(bound, owner, reply(started.thread.id, [humanId]))
          expect(yield* pending(bound, humanId)).toEqual([1, 2])
          const replied = yield* run(bound, actorFor(humanId), reply(started.thread.id, []))
          expect(replied.activity.sequence).toBe(3)
          expect(yield* pending(bound, humanId)).toEqual([])
          expect(yield* positionOf(bound, humanId, started.thread.id)).toEqual([3])
          // The reply notified the others, never its author.
          expect(
            (yield* bound.notifications.listPendingByRecipient(Notification.ofMember(owner.memberId, owner.identity), {
              limit: 10
            })).map((note) => note.thread?.sequence)
          ).toEqual([3])
        })
      )
    )
  )
})

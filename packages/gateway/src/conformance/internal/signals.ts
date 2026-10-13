import { ChangeFeed, ChangeFeedService } from "@amends-dev/core/change-feed"
import { CoreError } from "@amends-dev/core/error"
import { Group, GroupService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { NotificationService } from "@amends-dev/core/notification"
import { ReadStateService } from "@amends-dev/core/read-state"
import { Signal, SignalHub } from "@amends-dev/core/signal"
import { Thread, ThreadMessageService, ThreadService } from "@amends-dev/core/thread"
import { Member } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import type * as Fixture from "../Fixture.ts"
import * as Support from "../Support.ts"

const memberActor = (name: string) =>
  Actor.Actor.of({
    workspaceId: Support.workspaceId,
    memberId: Member.Id.make(name),
    identity: { _tag: "Human", id: Identity.HumanId.make(name) }
  })
const reader = memberActor("reader")
const outsider = memberActor("outsider")
const unpermitted = memberActor("unpermitted")

/** Buffer a stream for the enclosing scope, taking one element at a time. */
const buffer = <A, E>(stream: Stream.Stream<A, E>) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<A>()
    yield* stream.pipe(
      Stream.runForEach((value) => Queue.offer(queue, value)),
      Effect.forkScoped
    )
    return Queue.take(queue).pipe(Effect.timeout("10 seconds"))
  })
const sameSignal = Schema.toEquivalence(Signal.Signal)
/** The values taken before the marker, which the caller published after what it expects. */
const until = Effect.fnUntraced(function* <E>(next: Effect.Effect<Signal.Signal, E>, marker: Signal.Signal) {
  const received: Array<Signal.Signal> = []
  for (;;) {
    const signal = yield* next
    if (sameSignal(signal, marker)) return received
    received.push(signal)
  }
})
/** A feed's signals; any commit fails the test, since none is expected while it is read. */
const signalsOf = <E>(next: Effect.Effect<ChangeFeed.Message, E>) =>
  Effect.flatMap(next, (message) =>
    ChangeFeed.Message.isAnyOf(["Signal"])(message)
      ? Effect.succeed(message.signal)
      : Effect.die(new Error(`Expected a signal, got ${message._tag}`))
  )
/** A marker only the member receives: their own read time for a group nobody reads. */
const markerFor = (memberId: Member.Id) =>
  Signal.Signal.cases.GroupRead.make({
    workspaceId: Support.workspaceId,
    memberId,
    groupId: Group.Id.make("marker"),
    readAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z")
  })
/** A workspace's signal hub on a host, as storage binds it. */
const hubOf = (host: Context.Context<Fixture.Host>, id = Support.workspaceId) =>
  Effect.map(Support.forWorkspace(host, id), (bound) => Context.get(bound.context, SignalHub.SignalHub))

/** Ephemeral signals through the host's hub: delivery across hosts, by workspace and by reach. */
export const signals = (fixture: Fixture.Fixture) => {
  const { core, initialized, seed } = Support

  /**
   * Two hosts over the storage, each with one core for the workspace as a running process has.
   * The owner, the reader, and an unpermitted member share a private group with a thread that
   * mentions the reader; the outsider is a viewer outside the group.
   */
  const world = (storage: Fixture.Storage) =>
    Effect.gen(function* () {
      const first = yield* storage.connect()
      const second = yield* storage.connect()
      const here: Support.Bound = yield* Support.forWorkspace(first, Support.workspaceId)
      const workspace = yield* initialized(here)
      const owner = Actor.Actor.of({
        workspaceId: Support.workspaceId,
        memberId: workspace.ownerMemberId,
        identity: Support.alice
      })
      yield* seed(here, [reader, outsider, unpermitted], [reader, outsider])
      const cores = {
        first: yield* Layer.build(core(here)),
        second: yield* Layer.build(core(yield* Support.forWorkspace(second, Support.workspaceId)))
      }
      const as =
        (host: keyof typeof cores) =>
        <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
          program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(cores[host]))
      const group = yield* as("first")(
        owner,
        Effect.flatMap(GroupService.GroupService, (groupService) =>
          groupService.createTeam({
            name: "Private",
            memberIds: [owner.memberId, reader.memberId, unpermitted.memberId]
          })
        )
      )
      const started = yield* as("first")(
        owner,
        Effect.flatMap(ThreadService.ThreadService, (threadService) =>
          threadService.startInGroup({
            groupId: group.id,
            mentions: [reader.memberId],
            text: "Look"
          })
        )
      )
      /** Subscribe to the change feed as a member on a host, after its opening Ready. */
      const feed = Effect.fnUntraced(function* (host: keyof typeof cores, actor: Actor.Actor["Service"]) {
        const next = yield* as(host)(
          actor,
          Effect.flatMap(ChangeFeedService.ChangeFeedService, (changeFeedService) => changeFeedService.watch())
        ).pipe(Effect.flatMap(buffer))
        expect(yield* next).toMatchObject({ _tag: "Ready", reset: true })
        return signalsOf(next)
      })
      return {
        first,
        owner,
        groupId: group.id,
        threadId: started.thread.id,
        as,
        feed
      }
    })

  describe.skipIf(!fixture.available)(`${fixture.name}: signals`, () => {
    it.live("signals reach the workspace's subscribers on every host in order, and only while subscribed", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const first = yield* storage.connect()
          const second = yield* storage.connect()
          const signal = (n: number) =>
            Signal.Signal.cases.ThreadRead.make({
              workspaceId: Support.workspaceId,
              memberId: reader.memberId,
              threadId: Thread.Id.make("thread"),
              readThrough: n
            })
          const subscribe = (host: Context.Context<Fixture.Host>, id = Support.workspaceId) =>
            hubOf(host, id).pipe(
              Effect.flatMap((signalHub) => signalHub.subscribe),
              Effect.flatMap(buffer)
            )
          const there = yield* subscribe(second)
          const alsoHere = yield* subscribe(first)
          const elsewhere = yield* subscribe(second, Support.otherWorkspaceId)
          yield* (yield* hubOf(first)).publish(signal(1))
          yield* (yield* hubOf(second)).publish(signal(2))
          const marker = Signal.Signal.cases.GroupRead.make({
            workspaceId: Support.otherWorkspaceId,
            memberId: reader.memberId,
            groupId: Group.Id.make("marker"),
            readAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z")
          })
          yield* (yield* hubOf(first, Support.otherWorkspaceId)).publish(marker)
          for (const next of [there, alsoHere]) expect([yield* next, yield* next]).toEqual([signal(1), signal(2)])
          // Another workspace's subscribers hear nothing of this one.
          expect(yield* until(elsewhere, marker)).toEqual([])
          // Nothing is kept for later subscribers.
          const late = yield* subscribe(second)
          yield* (yield* hubOf(first)).publish(signal(3))
          expect(yield* late).toEqual(signal(3))
        }).pipe(Effect.scoped)
      )
    )

    it.live("typing on one host reaches the thread's readers on another, and nobody else", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const { first, owner, groupId, threadId, as, feed } = yield* world(storage)
          const [readerFeed, outsiderFeed, unpermittedFeed] = yield* Effect.forEach(
            [reader, outsider, unpermitted],
            (actor) => feed("second", actor)
          )
          if (!readerFeed || !outsiderFeed || !unpermittedFeed) return yield* Effect.die("Expected three feeds")
          const before = yield* DateTime.now
          yield* as("first")(
            owner,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.typing(threadId)
            )
          )
          const typing = yield* readerFeed
          expect(typing).toMatchObject({
            _tag: "Typing",
            workspaceId: Support.workspaceId,
            groupId,
            threadId,
            memberId: owner.memberId
          })
          if (!Signal.Signal.isAnyOf(["Typing"])(typing)) return yield* Effect.die("Expected typing")
          expect(DateTime.isGreaterThan(typing.until, before)).toBe(true)
          // Outside the group, or without permission to read the thread, it never arrives.
          for (const [actor, next] of [
            [outsider, outsiderFeed],
            [unpermitted, unpermittedFeed]
          ] as const) {
            yield* (yield* hubOf(first)).publish(markerFor(actor.memberId))
            expect(yield* until(next, markerFor(actor.memberId))).toEqual([])
          }
        }).pipe(Effect.scoped)
      )
    )

    it.live("typing needs access to the thread and permission to post in it", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const { threadId, as } = yield* world(storage)
          const typing = (actor: Actor.Actor["Service"], thread = threadId) =>
            as("first")(
              actor,
              Effect.flip(
                Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
                  threadMessageService.typing(thread)
                )
              )
            )
          const notFound = (thread: Thread.Id) => new CoreError.NotFound({ resource: "Thread", id: thread })
          expect(yield* typing(outsider)).toEqual(notFound(threadId))
          const missing = Thread.Id.make("missing")
          expect(yield* typing(reader, missing)).toEqual(notFound(missing))
          expect(yield* typing(unpermitted)).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
        }).pipe(Effect.scoped)
      )
    )

    it.live("a person's read state reaches their sessions on every host, and nobody else", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const { first, owner, groupId, threadId, as, feed } = yield* world(storage)
          const elsewhere = yield* feed("second", reader)
          const sameHost = yield* feed("first", reader)
          const ownerFeed = yield* feed("second", owner)
          const [notification] = yield* as("first")(
            reader,
            Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
              Effect.map(notificationService.inbox({ limit: 10 }), (items) => items.map((item) => item.notification))
            )
          )
          if (notification === undefined) return yield* Effect.die("Expected a notification")
          yield* as("first")(
            reader,
            Effect.gen(function* () {
              yield* (yield* NotificationService.NotificationService).markSeen(notification.id)
              const readStateService = yield* ReadStateService.ReadStateService
              yield* readStateService.markThreadRead({ threadId, throughSequence: 1 })
              yield* readStateService.markGroupRead({ groupId })
            })
          )
          for (const next of [elsewhere, sameHost])
            expect([yield* next, yield* next, yield* next]).toMatchObject([
              {
                _tag: "NotificationsSeen",
                memberId: reader.memberId,
                notificationIds: [notification.id]
              },
              { _tag: "ThreadRead", memberId: reader.memberId, threadId, readThrough: 1 },
              { _tag: "GroupRead", memberId: reader.memberId, groupId }
            ])
          // Someone reading the same thread hears none of it.
          yield* (yield* hubOf(first)).publish(markerFor(owner.memberId))
          expect(yield* until(ownerFeed, markerFor(owner.memberId))).toEqual([])
        }).pipe(Effect.scoped)
      )
    )
  })
}

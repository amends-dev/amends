import { BuiltinRoles } from "@amends-dev/core/authorization"
import { ChangeFeed, ChangeFeedService } from "@amends-dev/core/change-feed"
import type { CoreError } from "@amends-dev/core/error"
import { Identity } from "@amends-dev/core/identity"
import { InvitationService } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Gateway from "../../Gateway.ts"
import type * as Fixture from "../Fixture.ts"
import * as Support from "../Support.ts"

const issue = (recipient: Identity.HumanId) =>
  InvitationService.InvitationService.use((invitations) =>
    Effect.flatMap(DateTime.now, (now) =>
      invitations.issue({
        recipientId: recipient,
        roleId: BuiltinRoles.MemberId,
        expiresAt: DateTime.add(now, { hours: 1 })
      })
    )
  )

/** Buffer a subscription's messages for the enclosing scope, returning what takes the next one. */
const listen = <E, R>(watch: Effect.Effect<Stream.Stream<ChangeFeed.Message, CoreError.Unavailable>, E, R>) =>
  Effect.gen(function* () {
    const stream = yield* watch
    const queue = yield* Queue.unbounded<ChangeFeed.Message>()
    yield* stream.pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.forkScoped
    )
    // @effect-diagnostics-next-line returnEffectInGen:off
    return Queue.take(queue)
  })
const committed = (message: ChangeFeed.Message) => {
  if (!ChangeFeed.Message.isAnyOf(["Committed"])(message)) throw new Error(`Expected a commit, got ${message._tag}`)
  return message
}
const watch = (options?: ChangeFeed.WatchOptions) =>
  Effect.flatMap(ChangeFeedService.ChangeFeedService, (changeFeedService) => changeFeedService.watch(options))
const human = (name: string) => Identity.HumanId.make(name)

/** The change feed read from the journal: delivery across hosts, and resumption on another. */
export const changeFeed = (fixture: Fixture.Fixture) => {
  const { gateway } = Support
  describe.skipIf(!fixture.available)(`${fixture.name}: change feed`, () => {
    it.effect("a subscriber receives commits made through its own host and through another", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          // Each host keeps one gateway for the test, as a running process would.
          const first = yield* Layer.build(gateway(yield* storage.connect()))
          const second = yield* Layer.build(gateway(yield* storage.connect()))
          const on = <A, E>(host: typeof first, program: Effect.Effect<A, E, Gateway.Gateway | Scope.Scope>) =>
            Effect.provide(program, host)
          const workspace = yield* on(
            first,
            Effect.flatMap(Gateway.Gateway, (gateway) =>
              gateway.createWorkspace(Support.alice.id, { name: "Feed", memberName: "alice" })
            )
          )
          const next = yield* on(
            first,
            Effect.flatMap(Gateway.Gateway, (gateway) => listen(gateway.asMember(workspace.id, Support.alice, watch())))
          )
          const ready = yield* next
          expect(ready).toMatchObject({ _tag: "Ready", workspaceId: workspace.id, reset: true })
          yield* on(
            second,
            Effect.flatMap(Gateway.Gateway, (gateway) =>
              gateway.asMember(workspace.id, Support.alice, issue(Support.bob.id))
            )
          )
          const fromOther = committed(yield* next)
          expect(fromOther.stale).toEqual([{ read: "invitations" }])
          yield* on(
            first,
            Effect.flatMap(Gateway.Gateway, (gateway) =>
              gateway.asMember(workspace.id, Support.alice, issue(human("carol")))
            )
          )
          const fromOwn = committed(yield* next)
          expect(Number(fromOwn.cursor)).toBeGreaterThan(Number(fromOther.cursor))
          if (!ChangeFeed.Message.isAnyOf(["Ready"])(ready) || ready.cursor === null)
            return yield* Effect.die("Expected a cursor at the initialized workspace")
          expect(Number(fromOther.cursor)).toBeGreaterThan(Number(ready.cursor))
        })
      )
    )

    it.effect("a cursor resumes on another host with the commits missed in between", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const first = yield* storage.connect()
          const second = yield* storage.connect()
          const workspace = yield* Effect.flatMap(Gateway.Gateway, (gateway) =>
            gateway.createWorkspace(Support.alice.id, { name: "Resume", memberName: "alice" })
          ).pipe(Effect.provide(gateway(first)))
          const cursor = yield* Effect.scoped(
            Effect.gen(function* () {
              const gateway = yield* Gateway.Gateway
              const next = yield* listen(gateway.asMember(workspace.id, Support.alice, watch()))
              yield* next
              yield* gateway.asMember(workspace.id, Support.alice, issue(Support.bob.id))
              return committed(yield* next).cursor
            }).pipe(Effect.provide(gateway(first)))
          )
          const missed = yield* Effect.flatMap(Gateway.Gateway, (gateway) =>
            Effect.forEach(["carol", "dave"], (name) =>
              gateway.asMember(workspace.id, Support.alice, issue(human(name)))
            )
          ).pipe(Effect.provide(gateway(first)))
          yield* Effect.gen(function* () {
            const gateway = yield* Gateway.Gateway
            const next = yield* listen(gateway.asMember(workspace.id, Support.alice, watch({ after: cursor })))
            expect(yield* next).toEqual({
              _tag: "Ready",
              workspaceId: workspace.id,
              cursor,
              reset: false
            })
            const replayed = [committed(yield* next), committed(yield* next)]
            // Each missed invitation's commit, in order.
            expect(replayed.map((m) => m.stale)).toEqual(missed.map(() => [{ read: "invitations" }]))
            expect(Number(replayed[0]?.cursor)).toBeGreaterThan(Number(cursor))
            expect(Number(replayed[1]?.cursor)).toBeGreaterThan(Number(replayed[0]?.cursor))
          }).pipe(Effect.provide(gateway(second)))
        })
      )
    )
  })
}

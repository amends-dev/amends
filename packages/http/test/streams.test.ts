import { Identity } from "@amends-dev/core/identity"
import { WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Scope, Stream } from "effect"
import { Draining, Streams } from "../src/index.ts"

class Unavailable {
  readonly _tag = "Unavailable"
}

/** Streams as a host that can drain serves them, with the drain it would complete. */
const served = Effect.gen(function* () {
  const streams = yield* Streams.Streams
  const draining = yield* Draining.Draining
  return { streams, draining }
}).pipe(Effect.provide(Streams.layer.pipe(Layer.provideMerge(Draining.layer))))

describe("Streams.serve", () => {
  it.effect("ends a stream that ends on its own, as a finished turn's log does", () =>
    Effect.gen(function* () {
      const { streams } = yield* served
      const exit = yield* Effect.exit(
        Stream.runCollect(streams.serve(Stream.make("Opened", "Ended"), () => new Unavailable()))
      )
      expect(exit).toEqual(Exit.succeed(["Opened", "Ended"]))
    })
  )

  it.effect("fails a stream the shutdown cuts short, so its client reconnects", () =>
    Effect.gen(function* () {
      const { streams, draining } = yield* served
      const following = streams.serve(Stream.concat(Stream.make("Opened"), Stream.never), () => new Unavailable())
      const fiber = yield* Effect.forkChild(Effect.exit(Stream.runCollect(following)))
      yield* Effect.yieldNow
      yield* Deferred.succeed(draining, undefined)
      const exit = yield* Fiber.join(fiber)
      expect(exit).toEqual(Exit.fail(new Unavailable()))
    })
  )
})

describe("Streams.hold", () => {
  it.effect("holds each stream's place within its workspace's and its member's limits until it closes", () =>
    Effect.gen(function* () {
      const streams = yield* Effect.provide(
        Effect.service(Streams.Streams),
        Streams.layer.pipe(Layer.provide(Layer.succeed(Streams.Limits, { perWorkspace: 3, perMember: 2 })))
      )
      const workspaceId = WorkspaceId.WorkspaceId.make("workspace")
      const member = (id: string) => Identity.MemberReference.cases.Human.make({ id: Identity.HumanId.make(id) })
      /** Open a stream for `principal`, holding its place until the scope it returns closes. */
      const open = (principal: Identity.MemberReference) =>
        Effect.flatMap(Scope.make(), (scope) =>
          Effect.as(Scope.provide(streams.hold(workspaceId, principal), scope), scope)
        )
      const first = yield* open(member("alice"))
      yield* open(member("alice"))
      expect(yield* Effect.flip(open(member("alice")))).toMatchObject({
        _tag: "ApiErrors.TooManyStreams",
        limit: "member"
      })
      yield* open(member("bob"))
      expect(yield* Effect.flip(open(member("carol")))).toMatchObject({
        _tag: "ApiErrors.TooManyStreams",
        limit: "workspace"
      })
      // Closing a stream gives its place back, to its member and to the workspace.
      yield* Scope.close(first, Exit.void)
      yield* open(member("carol"))
    })
  )
})

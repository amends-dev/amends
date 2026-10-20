import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { ExpireConfirmation } from "./command.ts"
import { Message } from "./definition.ts"

describe("ExpireConfirmation", () => {
  it.effect("reports that the confirmation had its time once five seconds have passed, and not before", () =>
    Effect.gen(function* () {
      const expiry = yield* Effect.forkChild(
        ExpireConfirmation({ id: 7 }).effect.pipe(Effect.provide(ExpireConfirmation.layer))
      )

      yield* TestClock.adjust("4 seconds")
      expect(expiry.pollUnsafe()).toBeUndefined()

      yield* TestClock.adjust("1 second")
      expect(yield* Fiber.join(expiry)).toEqual(Message.ExpiredConfirmation({ id: 7 }))
    })
  )

  it.effect("gives each confirmation its own five seconds, started when it was confirmed", () =>
    Effect.gen(function* () {
      const first = yield* Effect.forkChild(
        ExpireConfirmation({ id: 1 }).effect.pipe(Effect.provide(ExpireConfirmation.layer))
      )

      yield* TestClock.adjust("3 seconds")
      const second = yield* Effect.forkChild(
        ExpireConfirmation({ id: 2 }).effect.pipe(Effect.provide(ExpireConfirmation.layer))
      )

      yield* TestClock.adjust("2 seconds")
      expect(yield* Fiber.join(first)).toEqual(Message.ExpiredConfirmation({ id: 1 }))
      expect(second.pollUnsafe()).toBeUndefined()

      yield* TestClock.adjust("3 seconds")
      expect(yield* Fiber.join(second)).toEqual(Message.ExpiredConfirmation({ id: 2 }))
    })
  )
})

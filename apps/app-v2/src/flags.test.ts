import { describe, expect, it, vi } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { KeyValueStore } from "effect/persistence"
import { flags, namesApplePlatform } from "./flags.ts"
import * as Session from "./session.ts"

const session = Session.layer("http://127.0.0.1:8787").pipe(Layer.provide(KeyValueStore.layerMemory))

/** Whether the flags say the page runs on an Apple platform, in a browser whose `navigator` is `browser`. */
const readIsApplePlatform = (browser: object) =>
  Effect.acquireRelease(
    Effect.sync(() => vi.stubGlobal("navigator", browser)),
    () => Effect.sync(() => vi.unstubAllGlobals())
  ).pipe(
    Effect.andThen(flags),
    Effect.map(({ isApplePlatform }) => isApplePlatform),
    Effect.scoped,
    Effect.provide(session)
  )

describe("namesApplePlatform", () => {
  it("is true for what macOS, iOS, and iPadOS call themselves", () => {
    expect(["MacIntel", "macOS", "iPhone", "iPad", "iPod"].map(namesApplePlatform)).toEqual([
      true,
      true,
      true,
      true,
      true
    ])
  })

  it("is false for the other systems, and for no name", () => {
    expect(["Win32", "Windows", "Linux x86_64", "Linux armv81", "Android", "CrOS", ""].map(namesApplePlatform)).toEqual(
      [false, false, false, false, false, false, false]
    )
  })
})

describe("the flags", () => {
  it.effect(
    "say the page runs on an Apple platform by navigator.platform where the browser gives no user agent data",
    () =>
      Effect.gen(function* () {
        expect(yield* readIsApplePlatform({ platform: "MacIntel" })).toBe(true)
        expect(yield* readIsApplePlatform({ platform: "iPhone" })).toBe(true)
        expect(yield* readIsApplePlatform({ platform: "Win32" })).toBe(false)
        expect(yield* readIsApplePlatform({ platform: "Linux x86_64" })).toBe(false)
      })
  )

  it.effect("say it by the user agent data's platform where the browser has it, over navigator.platform", () =>
    Effect.gen(function* () {
      expect(yield* readIsApplePlatform({ platform: "Win32", userAgentData: { platform: "macOS" } })).toBe(true)
      expect(yield* readIsApplePlatform({ platform: "MacIntel", userAgentData: { platform: "Windows" } })).toBe(false)
      expect(yield* readIsApplePlatform({ platform: "MacIntel", userAgentData: {} })).toBe(true)
    })
  )
})

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { KeyValueStore } from "effect/persistence"
import { keepAppearance, readKeptAppearance, showAppearance } from "./appearance.ts"

const theme = () => document.documentElement.getAttribute("data-theme")

describe("the kept Appearance", () => {
  it.effect("is System until the person chooses one, and then the one they chose", () =>
    Effect.gen(function* () {
      expect(yield* readKeptAppearance).toBe("System")
      yield* keepAppearance("Light")
      expect(yield* readKeptAppearance).toBe("Light")
      yield* keepAppearance("Dark")
      expect(yield* readKeptAppearance).toBe("Dark")
      yield* keepAppearance("System")
      expect(yield* readKeptAppearance).toBe("System")
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )

  it.effect("is System when what the browser kept is not an Appearance", () =>
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore
      yield* store.set("amends/appearance", "Sepia")
      expect(yield* readKeptAppearance).toBe("System")
    }).pipe(Effect.provide(KeyValueStore.layerMemory))
  )
})

describe("showing an Appearance", () => {
  it.effect("sets data-theme on the root element for Light and Dark, and removes it for System", () =>
    Effect.gen(function* () {
      expect(theme()).toBeNull()
      yield* showAppearance("Dark")
      expect(theme()).toBe("dark")
      yield* showAppearance("Light")
      expect(theme()).toBe("light")
      yield* showAppearance("System")
      expect(theme()).toBeNull()
    }).pipe(Effect.ensuring(Effect.sync(() => document.documentElement.removeAttribute("data-theme"))))
  )
})

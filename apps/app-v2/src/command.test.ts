import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { KeyValueStore } from "effect/persistence"
import { readKeptAppearance } from "./appearance.ts"
import { KeepAppearance, ShowAppearance, Navigate } from "./command.ts"
import { Message } from "./message.ts"

const theme = () => document.documentElement.getAttribute("data-theme")

/** Leave the page's root element as it was found. */
const resetTheme = Effect.sync(() => document.documentElement.removeAttribute("data-theme"))

describe("ShowAppearance", () => {
  it.effect("puts the Appearance on the page's root element, and removes it for System", () =>
    Effect.gen(function* () {
      expect(theme()).toBeNull()

      const dark = yield* ShowAppearance({ appearance: "Dark" }).effect
      expect(dark).toEqual(Message.CompletedShowAppearance())
      expect(theme()).toBe("dark")

      yield* ShowAppearance({ appearance: "Light" }).effect
      expect(theme()).toBe("light")

      yield* ShowAppearance({ appearance: "System" }).effect
      expect(theme()).toBeNull()
    }).pipe(Effect.provide(ShowAppearance.layer), Effect.ensuring(resetTheme))
  )
})

describe("KeepAppearance", () => {
  it.effect("keeps the Appearance in the browser for the next visit, and reports it kept", () =>
    Effect.gen(function* () {
      expect(yield* readKeptAppearance).toBe("System")

      const kept = yield* KeepAppearance({ appearance: "Dark" }).effect
      expect(kept).toEqual(Message.CompletedKeepAppearance())
      expect(yield* readKeptAppearance).toBe("Dark")

      yield* KeepAppearance({ appearance: "Light" }).effect
      expect(yield* readKeptAppearance).toBe("Light")
    }).pipe(Effect.provide(Layer.provideMerge(KeepAppearance.layer, KeyValueStore.layerMemory)))
  )

  it.effect("reports the Appearance kept even where the browser refuses to keep it", () =>
    Effect.gen(function* () {
      const refusing = KeyValueStore.make({
        get: () => Effect.undefined,
        getUint8Array: () => Effect.undefined,
        set: (key) =>
          Effect.fail(new KeyValueStore.KeyValueStoreError({ message: "Storage is full", method: "set", key })),
        remove: () => Effect.void,
        clear: Effect.void,
        size: Effect.succeed(0)
      })
      const message = yield* KeepAppearance({ appearance: "Dark" }).effect.pipe(
        Effect.provide(Layer.provide(KeepAppearance.layer, Layer.succeed(KeyValueStore.KeyValueStore, refusing)))
      )

      expect(message).toEqual(Message.CompletedKeepAppearance())
    })
  )
})

describe("Navigate", () => {
  it.effect("writes history once, replaces when asked, and focuses same-page fragments", () =>
    Effect.gen(function* () {
      const original = window.location.href
      const element = document.createElement("main")
      element.id = "route-focus-target"
      element.tabIndex = -1
      const pushes: Array<string | URL | null | undefined> = []
      const replacements: Array<string | URL | null | undefined> = []
      const pushState = window.history.pushState.bind(window.history)
      const replaceState = window.history.replaceState.bind(window.history)
      let changes = 0
      const changed = () => {
        changes++
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          document.body.append(element)
          window.addEventListener("foldkit:urlchange", changed)
          window.history.pushState = (data, unused, url) => {
            pushes.push(url)
            pushState(data, unused, url)
          }
          window.history.replaceState = (data, unused, url) => {
            replacements.push(url)
            replaceState(data, unused, url)
          }
        }),
        () =>
          Effect.sync(() => {
            window.removeEventListener("foldkit:urlchange", changed)
            window.history.pushState = pushState
            window.history.replaceState = replaceState
            replaceState({}, "", original)
            element.remove()
          })
      )
      yield* Navigate({ url: "/workspaces/test/agents", replace: false }).effect
      yield* Navigate({ url: "/workspaces/test/agents", replace: false }).effect
      expect(pushes).toHaveLength(1)
      expect(changes).toBe(1)
      yield* Navigate({ url: "/workspaces/test/inbox", replace: true }).effect
      expect(replacements).toHaveLength(1)
      yield* Navigate({ url: "#route-focus-target", replace: false }).effect
      expect(document.activeElement).toBe(element)
      expect(window.location.pathname).toBe("/workspaces/test/inbox")
      expect(window.location.hash).toBe("#route-focus-target")
    }).pipe(Effect.provide(Navigate.layer), Effect.scoped)
  )
})

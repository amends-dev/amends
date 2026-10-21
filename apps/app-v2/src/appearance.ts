/**
 * How the app looks to the person: their choice of Appearance, which the design's theme follows. System leaves it to
 * the browser's preference; Light and Dark override it through `data-theme` on the page's root element. The browser
 * keeps the choice for the next visit, and `index.html` shows it before the page first paints, reading the key kept
 * here.
 */

import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Schema from "effect/Schema"

export const Appearance = Schema.Literals(["System", "Light", "Dark"])
export type Appearance = typeof Appearance.Type

const storageKey = "amends/appearance"

/** The Appearance the browser kept from the last visit: System when none was kept or what was kept is not one. */
export const readKeptAppearance: Effect.Effect<Appearance, never, KeyValueStore.KeyValueStore> = Effect.gen(
  function* () {
    const store = yield* KeyValueStore.KeyValueStore
    const kept = yield* Effect.orElseSucceed(store.get(storageKey), () => undefined)
    return Schema.is(Appearance)(kept) ? kept : "System"
  }
)

/** Keep `appearance` for the next visit, unless the browser's storage refuses it. */
export const keepAppearance = (appearance: Appearance): Effect.Effect<void, never, KeyValueStore.KeyValueStore> =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set(storageKey, appearance)
  }).pipe(
    Effect.tapCause((cause) => Effect.logWarning("The appearance could not be kept", cause)),
    Effect.ignore
  )

/** Show `appearance` on the page: `data-theme` on the root element for Light and Dark, and none for System. */
export const showAppearance = (appearance: Appearance): Effect.Effect<void> =>
  Effect.sync(() => {
    const root = document.documentElement
    if (appearance === "System") {
      root.removeAttribute("data-theme")
    } else {
      root.setAttribute("data-theme", appearance.toLowerCase())
    }
  })

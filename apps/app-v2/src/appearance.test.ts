import { runInNewContext } from "node:vm"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { KeyValueStore } from "effect/persistence"
import indexHtml from "../index.html?raw"
import { type Appearance, keepAppearance, readKeptAppearance, showAppearance } from "./appearance.ts"

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

/** The script `index.html` runs before the page first paints, which has no module to import it from. */
const firstPaintScript = (): string => {
  const [, script] = /<script>([\s\S]*?)<\/script>/.exec(indexHtml) ?? []
  if (script === undefined) throw new Error("index.html has no script before the page first paints")
  return script
}

/** Runs the script of `index.html` over `storage` and the page, as the browser does before the first paint. */
const runFirstPaintScript = (storage: Pick<Storage, "getItem">) =>
  runInNewContext(firstPaintScript(), { localStorage: storage, document })

describe("the Appearance before the first paint", () => {
  it.effect("shows the Appearance the app kept in the browser's storage, as showing it does", () =>
    Effect.gen(function* () {
      for (const appearance of [
        "System",
        "Light",
        "Dark",
        "Light",
        "System"
      ] as const satisfies ReadonlyArray<Appearance>) {
        yield* keepAppearance(appearance)
        document.documentElement.removeAttribute("data-theme")
        runFirstPaintScript(localStorage)
        const first = theme()

        document.documentElement.removeAttribute("data-theme")
        yield* showAppearance(appearance)

        expect(first).toBe(theme())
      }
    }).pipe(
      Effect.provide(BrowserKeyValueStore.layerLocalStorage),
      Effect.ensuring(
        Effect.sync(() => {
          localStorage.clear()
          document.documentElement.removeAttribute("data-theme")
        })
      )
    )
  )

  it("shows Light and Dark by the same key the app keeps them under, and shows nothing for System", () => {
    const storing = (value: string | null) => ({
      getItem: (key: string) => (key === "amends/appearance" ? value : null)
    })

    document.documentElement.removeAttribute("data-theme")
    runFirstPaintScript(storing("Light"))
    expect(theme()).toBe("light")
    runFirstPaintScript(storing("Dark"))
    expect(theme()).toBe("dark")
    document.documentElement.removeAttribute("data-theme")
    runFirstPaintScript(storing("System"))
    expect(theme()).toBeNull()
    document.documentElement.removeAttribute("data-theme")
  })

  it("shows nothing when nothing was kept, when what was kept is not an Appearance, or when the storage refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("Access denied")
      }
    }

    for (const storage of [{ getItem: () => null }, { getItem: () => "Sepia" }, refusing]) {
      runFirstPaintScript(storage)
      expect(theme()).toBeNull()
    }
  })
})

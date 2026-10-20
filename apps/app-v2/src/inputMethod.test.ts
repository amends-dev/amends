import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import * as InputMethod from "./inputMethod.ts"

/** The keys that reach a textarea's handler while `reserve` is in place, for each of the key events `pressed` makes. */
const keysReaching = (pressed: ReadonlyArray<KeyboardEventInit & Readonly<{ keyCode?: number }>>) =>
  Effect.sync(() => {
    const textarea = document.createElement("textarea")
    const reached: Array<string> = []
    document.body.append(textarea)
    textarea.addEventListener("keydown", (event) => reached.push(event.key))

    for (const { keyCode, ...init } of pressed) {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
      if (keyCode !== undefined) {
        Object.defineProperty(event, "keyCode", { value: keyCode })
      }
      textarea.dispatchEvent(event)
    }

    textarea.remove()
    return reached
  })

describe("the keys of an input method", () => {
  it.effect("do not reach a handler of the page while the input method composes text", () =>
    Effect.gen(function* () {
      const reached = yield* keysReaching([
        { key: "Enter" },
        { key: "Enter", isComposing: true },
        { key: "a" },
        { key: "Enter", keyCode: 229 },
        { key: "ArrowDown", isComposing: true },
        { key: "Enter", shiftKey: true }
      ]).pipe(Effect.provide(InputMethod.layer))

      // The Enter that confirms a conversion arrives composing in Chrome and with keyCode 229 in Safari.
      expect(reached).toEqual(["Enter", "a", "Enter"])
    })
  )

  it.effect("reach every handler again once the page stops reserving them", () =>
    Effect.gen(function* () {
      yield* Effect.scoped(Layer.build(InputMethod.layer))

      const reached = yield* keysReaching([
        { key: "Enter", isComposing: true },
        { key: "Enter", keyCode: 229 }
      ])

      expect(reached).toEqual(["Enter", "Enter"])
    })
  )

  it.effect("reach every handler before the page reserves them", () =>
    Effect.gen(function* () {
      const reached = yield* keysReaching([{ key: "Enter", isComposing: true }])

      expect(reached).toEqual(["Enter"])
    })
  )
})

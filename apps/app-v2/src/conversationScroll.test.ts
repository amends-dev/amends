import { describe, expect, it, vi } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { followEnd, isNearEnd, nearEnd, revealMessage, scrollToEnd } from "./conversationScroll.ts"

/*
 * happy-dom lays nothing out, so these tests give a pane body the extent a browser would measure, with
 * `scrollHeight` and `clientHeight` stubbed, and read back the `scrollTop` the effects set. What they cannot observe is
 * a real scroll: that the browser clamps `scrollTop` to the end, that a body anchored to the bottom rests a short list
 * against the footer, and that `scrollIntoView` moves a real pane. The effects wait for the next animation frame, which
 * happy-dom provides on the clock of the machine, so these run live.
 */

/** The extent of a pane body 400px tall that scrolls `scrollHeight`px, with the view `scrollTop`px down it. */
const extent = (scrollHeight: number, scrollTop: number) => ({ scrollHeight, scrollTop, clientHeight: 400 })

/**
 * The conversation `list`, with a message that is current when `current`, in a pane body that is anchored to `anchor`.
 */
const conversation = (
  options: Readonly<{ anchor: "bottom" | "top"; current?: boolean; scrollHeight: number; scrollTop: number }>
) => {
  document.body.innerHTML = `
    <div id="body" ${options.anchor === "bottom" ? 'data-anchor="bottom"' : ""}>
      <ol id="list"><li>Plans</li><li ${options.current === true ? 'aria-current="true"' : ""}>Sounds good</li></ol>
    </div>`
  const body = document.getElementById("body")!
  growTo(options.scrollHeight)
  Object.defineProperty(body, "clientHeight", { value: 400, configurable: true })
  body.scrollTop = options.scrollTop
  return body
}

/** The pane body as tall as `scrollHeight`, as it is once more is added to the conversation. */
const growTo = (scrollHeight: number) =>
  Object.defineProperty(document.getElementById("body")!, "scrollHeight", { value: scrollHeight, configurable: true })

describe("being near the end of a conversation", () => {
  it("is being less than 80px from it, as apps/ui counts it, and never being past it", () => {
    expect(nearEnd).toBe(80)
    expect(isNearEnd(extent(1000, 600))).toBe(true)
    expect(isNearEnd(extent(1000, 521))).toBe(true)
    expect(isNearEnd(extent(1000, 520))).toBe(false)
    expect(isNearEnd(extent(1000, 0))).toBe(false)
  })

  it("is being at the end of one that fits without scrolling", () => {
    expect(isNearEnd(extent(400, 0))).toBe(true)
    expect(isNearEnd(extent(0, 0))).toBe(true)
  })
})

describe("scrolling a conversation to its end", () => {
  it.live("scrolls the pane body to the end once the render has committed, wherever it was", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "bottom", scrollHeight: 1000, scrollTop: 0 })

      yield* scrollToEnd("list", { unlessCurrent: false })

      expect(body.scrollTop).toBe(1000)
    })
  )

  it.live("keeps the view while a message is current, which the person came for, when told to", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "bottom", current: true, scrollHeight: 1000, scrollTop: 100 })

      yield* scrollToEnd("list", { unlessCurrent: true })
      expect(body.scrollTop).toBe(100)

      yield* scrollToEnd("list", { unlessCurrent: false })
      expect(body.scrollTop).toBe(1000)
    })
  )

  it.live("scrolls to the end when told to keep the view for a current message and none is", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "bottom", scrollHeight: 1000, scrollTop: 100 })

      yield* scrollToEnd("list", { unlessCurrent: true })

      expect(body.scrollTop).toBe(1000)
    })
  )

  it.live("leaves a list that is not in a pane body anchored to the bottom, such as a task's activity", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "top", scrollHeight: 1000, scrollTop: 0 })

      yield* scrollToEnd("list", { unlessCurrent: false })

      expect(body.scrollTop).toBe(0)
    })
  )

  it.live("does nothing for a list that is not in the page", () =>
    Effect.gen(function* () {
      document.body.innerHTML = ""

      yield* scrollToEnd("list", { unlessCurrent: false })
      yield* followEnd("list")
    })
  )
})

describe("following the end of a conversation", () => {
  it.live("scrolls to the end when the person is near it, since more was added after they looked", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "bottom", scrollHeight: 1000, scrollTop: 560 })

      yield* followEnd("list")

      expect(body.scrollTop).toBe(1000)
    })
  )

  it.live("leaves the person where they scrolled to when they are further from the end", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "bottom", scrollHeight: 1000, scrollTop: 100 })

      yield* followEnd("list")

      expect(body.scrollTop).toBe(100)
    })
  )

  it.live("measures the view before the render commits, and scrolls to the end the render made", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "bottom", scrollHeight: 1000, scrollTop: 560 })

      // The pane grows once the effect has measured it, as it does when the render commits more of the conversation.
      yield* Effect.all([followEnd("list"), Effect.sync(() => growTo(1300))], { concurrency: "unbounded" })

      expect(body.scrollTop).toBe(1300)
    })
  )

  it.live("does not scroll a person who was far from the end when the render brings them near it", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "bottom", scrollHeight: 1000, scrollTop: 100 })

      yield* Effect.all([followEnd("list"), Effect.sync(() => growTo(480))], { concurrency: "unbounded" })

      expect(body.scrollTop).toBe(100)
    })
  )

  it.live("leaves a list that is not in a pane body anchored to the bottom", () =>
    Effect.gen(function* () {
      const body = conversation({ anchor: "top", scrollHeight: 1000, scrollTop: 560 })

      yield* followEnd("list")

      expect(body.scrollTop).toBe(560)
    })
  )
})

describe("revealing a message", () => {
  it.effect("scrolls it to the middle of the pane that scrolls it", () =>
    Effect.gen(function* () {
      const element = document.createElement("li")
      const scrollIntoView = vi.fn()
      element.scrollIntoView = scrollIntoView

      yield* revealMessage(element)

      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "center" })
    })
  )
})

import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import type { HtmlBuilder } from "foldkit/html"
import { expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { crashView } from "./crash.ts"

const context = { error: new Error("boom"), model: {}, message: Option.none() }

const crashed = {
  update: (model: null) => ({ model }),
  view: (_: null, h: HtmlBuilder<never>) => crashView(context, h).body
}

describe("the crash view", () => {
  it("says what happened as the screen's heading, with the words apps/ui gives it", () => {
    scene(
      crashed,
      given(null),
      expect(role("heading", { name: "Something went wrong", level: 1 })).toExist(),
      expect(text("amends stopped on an unexpected error. Reloading usually fixes it.")).toExist(),
      expect(within(role("main"), role("heading", { level: 1 }))).toExist()
    )
  })

  it("draws the state art of something that came apart, hidden from assistive technology", () => {
    scene(
      crashed,
      given(null),
      expect(within(role("main"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("main"), selector("svg"))).toHaveAttr("viewBox", "0 0 64 64"),
      expect(within(role("main"), selector(".art-swinging"))).toExist()
    )
  })

  it("reloads from a primary Reload that is a link to the page's own address, since it has no message to send", () => {
    scene(
      crashed,
      given(null),
      expect(role("link", { name: "Reload" })).toHaveAttr("href", ""),
      expect(role("link", { name: "Reload" })).not.toHaveAttr("target"),
      expect(role("link", { name: "Reload" })).toHaveClass("bg-action"),
      expect(role("link", { name: "Reload" })).toHaveClass("text-on-action"),
      expect(role("button")).toBeAbsent()
    )
  })

  it("is outside the session, so the header holds the brand alone", () => {
    scene(
      crashed,
      given(null),
      expect(within(role("banner"), text("amends"))).toExist(),
      expect(role("button", { name: "Sign out" })).toBeAbsent(),
      expect(within(role("banner"), selector("svg"))).toExist()
    )
  })
})

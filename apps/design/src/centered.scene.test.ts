import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { centered, centeredAccount, copy, heading, screenContent } from "./centered.ts"
import { button } from "./control.ts"

const Message = defineMessageUnion({ ClickedSignOut: {}, ClickedCreate: {} })
type Message = typeof Message.Type

type Model = Readonly<{ signOuts: number; creations: number }>

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedSignOut: () => ({ model: modifyFields(model, { signOuts: (signOuts) => signOuts + 1 }) }),
    ClickedCreate: () => ({ model: modifyFields(model, { creations: (creations) => creations + 1 }) })
  })

const screen = (width: "form" | "directory") => (model: Model, h: HtmlBuilder<Message>) =>
  centered(h, {
    actions: [button(h, "Sign out", Message.ClickedSignOut(), { variant: "quiet" })],
    width,
    children: [heading(h, "Sign in"), copy(h, "Enter the code sent to ada@example.com"), h.p([], [`${model.signOuts}`])]
  })

const initial: Model = { signOuts: 0, creations: 0 }

describe("centered", () => {
  for (const width of ["form", "directory"] as const) {
    it(`holds the title, the copy, and the children in its ${width} column, and the actions in its header`, () => {
      scene(
        { update, view: screen(width) },
        given(initial),
        expect(role("heading", { name: "Sign in", level: 1 })).toExist(),
        expect(text("Enter the code sent to ada@example.com")).toExist(),
        expect(within(role("main"), role("heading", { name: "Sign in" }))).toExist(),
        expect(within(role("banner"), text("amends"))).toExist(),
        click(within(role("banner"), role("button", { name: "Sign out" }))),
        expect(within(role("main"), text("1"))).toExist()
      )
    })
  }
})

describe("centered brand", () => {
  it("is the logo and the word amends in the header, the logo hidden from assistive technology", () => {
    scene(
      { update, view: screen("form") },
      given(initial),
      expect(within(role("banner"), text("amends"))).toExist(),
      expect(within(role("banner"), selector("svg"))).toHaveAttr("viewBox", "0 0 64 64"),
      expect(within(role("banner"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("banner"), selector("svg"))).toHaveAttr("width", "1.25rem"),
      expect(role("img")).toBeAbsent()
    )
  })
})

describe("centeredAccount", () => {
  const signedIn = (_: Model, h: HtmlBuilder<Message>) =>
    centered(h, {
      actions: [centeredAccount(h, "ada@example.com"), button(h, "Sign out", Message.ClickedSignOut())],
      width: "directory",
      children: [heading(h, "Choose a workspace")]
    })

  it("is the first letter of the identity in a mark, then the identity, beside Sign out", () => {
    scene(
      { update, view: signedIn },
      given(initial),
      expect(within(role("banner"), text("ada@example.com"))).toExist(),
      expect(within(role("banner"), text("a"))).toExist(),
      expect(within(role("banner"), role("button", { name: "Sign out" }))).toExist(),
      expect(within(role("banner"), selector('span[aria-hidden="true"]'))).toHaveText("a")
    )
  })

  it("lets the identity give way to the mark on phones", () => {
    scene(
      { update, view: signedIn },
      given(initial),
      expect(within(role("banner"), selector("span.truncate"))).toHaveText("ada@example.com"),
      expect(within(role("banner"), selector("span.truncate"))).toHaveClass("max-tablet:hidden")
    )
  })
})

describe("heading", () => {
  const titled = (action: "none" | "create") => (model: Model, h: HtmlBuilder<Message>) =>
    centered(h, {
      width: "directory",
      children: [
        screenContent(h, [
          heading(
            h,
            "Choose a workspace",
            action === "none"
              ? {}
              : { action: button(h, "Create workspace", Message.ClickedCreate(), { icon: "mark-new" }) }
          ),
          copy(h, "2 workspaces"),
          h.p([], [`${model.creations}`])
        ])
      ]
    })

  it("is the title alone, without a line of its own, when it has no action", () => {
    scene(
      { update, view: titled("none") },
      given(initial),
      expect(within(role("main"), role("heading", { name: "Choose a workspace", level: 1 }))).toExist(),
      expect(selector("div.items-center.gap-4")).toBeAbsent(),
      expect(role("button", { name: "Create workspace" })).toBeAbsent()
    )
  })

  it("shares its line with an action, which sends its message", () => {
    scene(
      { update, view: titled("create") },
      given(initial),
      expect(role("heading", { name: "Choose a workspace", level: 1 })).toExist(),
      expect(
        within(selector("div.items-center.gap-4"), role("heading", { name: "Choose a workspace", level: 1 }))
      ).toExist(),
      expect(within(selector("div.items-center.gap-4"), role("button", { name: "Create workspace" }))).toExist(),
      expect(within(selector("div.items-center.gap-4"), text("2 workspaces"))).toBeAbsent(),
      click(role("button", { name: "Create workspace" })),
      expect(within(role("main"), text("1"))).toExist()
    )
  })
})

describe("screenContent", () => {
  it("holds a screen's pieces in one node that does not take part in the card's layout", () => {
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) =>
          centered(h, {
            width: "form",
            children: [screenContent(h, [heading(h, "Sign in"), copy(h, "Enter the code sent to ada@example.com")])]
          })
      },
      given(initial),
      expect(within(role("main"), selector(".contents"))).toExist(),
      expect(within(selector(".contents"), role("heading", { name: "Sign in", level: 1 }))).toExist(),
      expect(within(selector(".contents"), text("Enter the code sent to ada@example.com"))).toExist()
    )
  })
})

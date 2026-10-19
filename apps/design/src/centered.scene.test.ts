import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { centered, copy, heading, screenContent } from "./centered.ts"
import { button } from "./control.ts"

const Message = defineMessageUnion({ ClickedSignOut: {} })
type Message = typeof Message.Type

type Model = Readonly<{ signOuts: number }>

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedSignOut: () => ({ model: modifyFields(model, { signOuts: (signOuts) => signOuts + 1 }) })
  })

const screen = (width: "form" | "directory") => (model: Model, h: HtmlBuilder<Message>) =>
  centered(h, {
    brand: "amends",
    actions: [button(h, "Sign out", Message.ClickedSignOut(), { variant: "quiet" })],
    width,
    children: [heading(h, "Sign in"), copy(h, "Enter the code sent to ada@example.com"), h.p([], [`${model.signOuts}`])]
  })

describe("centered", () => {
  for (const width of ["form", "directory"] as const) {
    it(`holds the title, the copy, and the children in its ${width} column, and the actions in its header`, () => {
      scene(
        { update, view: screen(width) },
        given({ signOuts: 0 }),
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

describe("screenContent", () => {
  it("holds a screen's pieces in one node that does not take part in the card's layout", () => {
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) =>
          centered(h, {
            brand: "amends",
            width: "form",
            children: [screenContent(h, [heading(h, "Sign in"), copy(h, "Enter the code sent to ada@example.com")])]
          })
      },
      given({ signOuts: 0 }),
      expect(within(role("main"), selector(".contents"))).toExist(),
      expect(within(selector(".contents"), role("heading", { name: "Sign in", level: 1 }))).toExist(),
      expect(within(selector(".contents"), text("Enter the code sent to ada@example.com"))).toExist()
    )
  })
})

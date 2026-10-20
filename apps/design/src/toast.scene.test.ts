import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { notice } from "./control.ts"
import { toast, toastStack } from "./toast.ts"

const Message = defineMessageUnion({ Dismissed: { key: Schema.String } })
type Message = typeof Message.Type

type Model = Readonly<{ refused: ReadonlyArray<string> }>

const initial: Model = { refused: ["post", "rename"] }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    Dismissed: ({ key }) => ({
      model: modifyFields(model, { refused: (refused) => refused.filter((id) => id !== key) })
    })
  })

const toasts = (model: Model, h: HtmlBuilder<Message>) =>
  toastStack(h, [
    notice(h, Option.none()),
    ...model.refused.map((key) =>
      toast(h, {
        text: `Couldn't ${key}: You may not.`,
        ...(key === "post" ? { detail: "found a bug. composer crashes" } : {}),
        action: { label: "Dismiss", onClick: Message.Dismissed({ key }) }
      })
    )
  ])

describe("toast", () => {
  it("is an alert with its text, the detail under it when there is one, and its action as a button", () => {
    scene(
      { update, view: toasts },
      given({ refused: ["post"] }),
      expect(within(role("alert"), text("Couldn't post: You may not."))).toExist(),
      expect(within(role("alert"), text("found a bug. composer crashes"))).toExist(),
      expect(within(role("alert"), role("button", { name: "Dismiss" }))).toExist()
    )
  })

  it("is a status, not an alert, for a confirmation of what the person did", () => {
    scene(
      {
        update,
        view: (_, h) =>
          toastStack(h, [
            toast(h, {
              text: "Joined Northstar Studio",
              role: "status",
              action: { label: "Dismiss", onClick: Message.Dismissed({ key: "joined" }) }
            })
          ])
      },
      given(initial),
      expect(role("alert")).toBeAbsent(),
      expect(within(role("status"), text("Joined Northstar Studio"))).toExist(),
      expect(within(role("status"), role("button", { name: "Dismiss" }))).toExist()
    )
  })

  it("shows no detail when it has none", () => {
    scene(
      { update, view: toasts },
      given({ refused: ["rename"] }),
      expect(text("Couldn't rename: You may not.")).toExist(),
      expect(text("found a bug. composer crashes")).toBeAbsent()
    )
  })

  it("sends its action's message, and the toast goes when the app takes it away", () => {
    scene(
      { update, view: toasts },
      given({ refused: ["post", "rename"] }),
      click(within(role("alert"), role("button", { name: "Dismiss" }))),
      expect(text("Couldn't post: You may not.")).toBeAbsent(),
      expect(text("Couldn't rename: You may not.")).toExist()
    )
  })
})

describe("toastStack", () => {
  it("is a polite live region holding each toast as an alert, and is there with none", () => {
    scene(
      { update, view: toasts },
      given(initial),
      expect(selector('[aria-live="polite"]')).toExist(),
      expect(within(selector('[aria-live="polite"]'), text("Couldn't post: You may not."))).toExist(),
      expect(within(selector('[aria-live="polite"]'), text("Couldn't rename: You may not."))).toExist(),
      click(within(selector('[aria-live="polite"]'), role("button", { name: "Dismiss" }))),
      click(role("button", { name: "Dismiss" })),
      expect(role("alert")).toBeAbsent(),
      expect(selector('[aria-live="polite"]')).toExist()
    )
  })

  it("holds a notice among the toasts", () => {
    scene(
      { update, view: (_, h) => toastStack(h, [notice(h, Option.some("Could not read your actions."))]) },
      given(initial),
      expect(within(selector('[aria-live="polite"]'), role("alert"))).toHaveText("Could not read your actions.")
    )
  })
})

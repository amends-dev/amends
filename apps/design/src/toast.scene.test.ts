import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { notice } from "./control.ts"
import { confirmation, confirmationStack, toast, toastStack } from "./toast.ts"

const Message = defineMessageUnion({ Dismissed: { key: Schema.String }, Opened: { key: Schema.String } })
type Message = typeof Message.Type

type Model = Readonly<{
  refused: ReadonlyArray<string>
  confirmed: ReadonlyArray<string>
  opened: ReadonlyArray<string>
}>

const initial: Model = { refused: ["post", "rename"], confirmed: ["Joined #launches", "Name saved"], opened: [] }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    Dismissed: ({ key }) => ({
      model: modifyFields(model, { refused: (refused) => refused.filter((id) => id !== key) })
    }),
    Opened: ({ key }) => ({
      model: modifyFields(model, {
        confirmed: (confirmed) => confirmed.filter((text) => text !== key),
        opened: (opened) => [...opened, key]
      })
    })
  })

const toasts = (model: Model, h: HtmlBuilder<Message>) =>
  toastStack(h, [
    notice(h, Option.none()),
    ...model.refused.map((key) =>
      toast(h, {
        text: `Couldn’t ${key}: You may not.`,
        ...(key === "post" ? { detail: "found a bug. composer crashes" } : {}),
        action: { label: "Dismiss", onClick: Message.Dismissed({ key }) }
      })
    )
  ])

const confirmations = (model: Model, h: HtmlBuilder<Message>) =>
  confirmationStack(
    h,
    model.confirmed.map((key) =>
      confirmation(h, {
        key,
        text: key,
        ...(key === "Joined #launches" ? { action: { label: "Open", onClick: Message.Opened({ key }) } } : {})
      })
    )
  )

describe("toast", () => {
  it("is an alert with its text, the detail under it when there is one, and its action as a button", () => {
    scene(
      { update, view: toasts },
      given({ ...initial, refused: ["post"] }),
      expect(within(role("alert"), text("Couldn’t post: You may not."))).toExist(),
      expect(within(role("alert"), text("found a bug. composer crashes"))).toExist(),
      expect(within(role("alert"), role("button", { name: "Dismiss" }))).toExist()
    )
  })

  it("shows no detail when it has none", () => {
    scene(
      { update, view: toasts },
      given({ ...initial, refused: ["rename"] }),
      expect(text("Couldn’t rename: You may not.")).toExist(),
      expect(text("found a bug. composer crashes")).toBeAbsent()
    )
  })

  it("sends its action's message, and the toast goes when the app takes it away", () => {
    scene(
      { update, view: toasts },
      given(initial),
      click(within(role("alert"), role("button", { name: "Dismiss" }))),
      expect(text("Couldn’t post: You may not.")).toBeAbsent(),
      expect(text("Couldn’t rename: You may not.")).toExist()
    )
  })

  it("is a raised card with a shadow, a refusal that waits for the person's Dismiss and is not a confirmation", () => {
    scene(
      { update, view: toasts },
      given({ ...initial, refused: ["rename"] }),
      expect(role("alert")).toHaveClass("bg-raised"),
      expect(role("alert")).toHaveClass("shadow-toast"),
      expect(role("status")).toBeAbsent()
    )
  })
})

describe("toastStack", () => {
  it("is a polite live region holding each toast as an alert, and is there with none", () => {
    scene(
      { update, view: toasts },
      given(initial),
      expect(selector('[aria-live="polite"]')).toExist(),
      expect(within(selector('[aria-live="polite"]'), text("Couldn’t post: You may not."))).toExist(),
      expect(within(selector('[aria-live="polite"]'), text("Couldn’t rename: You may not."))).toExist(),
      click(within(selector('[aria-live="polite"]'), role("button", { name: "Dismiss" }))),
      click(role("button", { name: "Dismiss" })),
      expect(role("alert")).toBeAbsent(),
      expect(selector('[aria-live="polite"]')).toExist()
    )
  })

  it("is pinned to the bottom end corner of the window", () => {
    scene(
      { update, view: toasts },
      given(initial),
      expect(selector('[aria-live="polite"]')).toHaveClass("fixed"),
      expect(selector('[aria-live="polite"]')).toHaveClass("end-4"),
      expect(selector('[aria-live="polite"]')).toHaveClass("bottom-4")
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

describe("confirmation", () => {
  it("is a status with a check before its words, and no Dismiss", () => {
    scene(
      { update, view: confirmations },
      given(initial),
      expect(within(role("status", { name: "Name saved" }), text("Name saved"))).toExist(),
      expect(within(role("status", { name: "Name saved" }), selector('svg[aria-hidden="true"]'))).toExist(),
      expect(role("button", { name: "Dismiss" })).toBeAbsent(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("has the one action it is given after its words, which sends its message and takes the confirmation away", () => {
    scene(
      { update, view: confirmations },
      given(initial),
      expect(within(role("list", { name: "Notifications" }), role("button", { name: "Open" }))).toExist(),
      expect(within(role("status", { name: "Name saved" }), role("button"))).toBeAbsent(),
      click(role("button", { name: "Open" })),
      expect(text("Joined #launches")).toBeAbsent(),
      expect(text("Name saved")).toExist(),
      expect(role("button", { name: "Open" })).toBeAbsent()
    )
  })

  it("is a card with a border and a shadow, 44px tall at least and 28rem wide at most, in the control size", () => {
    scene(
      { update, view: confirmations },
      given(initial),
      expect(role("status", { name: "Name saved" })).toHaveClass("min-h-11"),
      expect(role("status", { name: "Name saved" })).toHaveClass("max-w-[min(28rem,100%)]"),
      expect(role("status", { name: "Name saved" })).toHaveClass("border-outline"),
      expect(role("status", { name: "Name saved" })).toHaveClass("bg-popover"),
      expect(role("status", { name: "Name saved" })).toHaveClass("shadow-toast"),
      expect(role("status", { name: "Name saved" })).toHaveClass("text-control"),
      expect(role("status", { name: "Name saved" })).toHaveClass("font-medium"),
      expect(role("status", { name: "Name saved" })).toHaveClass("pointer-events-auto")
    )
  })

  it("has an action that is quiet text, 16px from the words, with a hover of its own", () => {
    scene(
      { update, view: confirmations },
      given(initial),
      expect(role("button", { name: "Open" })).toHaveClass("ms-4"),
      expect(role("button", { name: "Open" })).toHaveClass("hover:bg-subtle"),
      expect(role("button", { name: "Open" })).toHaveClass("focus-ring")
    )
  })
})

describe("confirmationStack", () => {
  it("is a polite live region named Notifications with an item for each confirmation, and is there with none", () => {
    scene(
      { update, view: confirmations },
      given(initial),
      expect(role("list", { name: "Notifications" })).toHaveAttr("aria-live", "polite"),
      expect(within(role("list", { name: "Notifications" }), text("Joined #launches"))).toExist(),
      expect(within(role("list", { name: "Notifications" }), text("Name saved"))).toExist()
    )
    scene(
      { update, view: confirmations },
      given({ ...initial, confirmed: [] }),
      expect(role("list", { name: "Notifications" })).toExist()
    )
  })

  it("is centered at the bottom of the window, 24px above its edge and any home indicator, newest at the bottom", () => {
    scene(
      { update, view: confirmations },
      given(initial),
      expect(role("list", { name: "Notifications" })).toHaveClass("fixed"),
      expect(role("list", { name: "Notifications" })).toHaveClass("inset-x-0"),
      expect(role("list", { name: "Notifications" })).toHaveClass("bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"),
      expect(role("list", { name: "Notifications" })).toHaveClass("items-center"),
      expect(role("list", { name: "Notifications" })).toHaveClass("flex-col"),
      expect(role("list", { name: "Notifications" })).toHaveClass("gap-2")
    )
  })

  it("lets clicks through to the window except where a confirmation is, over the panes as the refusals are", () => {
    scene(
      { update, view: confirmations },
      given(initial),
      expect(role("list", { name: "Notifications" })).toHaveClass("pointer-events-none"),
      expect(role("list", { name: "Notifications" })).toHaveClass("z-30")
    )
  })

  it("lies beside the stack of refusals, which keeps its corner and its Dismiss", () => {
    scene(
      { update, view: (model, h) => h.div([], [toasts(model, h), confirmations(model, h)]) },
      given(initial),
      expect(within(selector('div[aria-live="polite"]'), text("Couldn’t post: You may not."))).toExist(),
      expect(within(role("list", { name: "Notifications" }), text("Name saved"))).toExist(),
      expect(within(selector('div[aria-live="polite"]'), role("button", { name: "Dismiss" }))).toExist(),
      expect(within(role("list", { name: "Notifications" }), role("button", { name: "Open" }))).toExist()
    )
  })
})

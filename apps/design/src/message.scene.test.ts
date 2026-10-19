import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button } from "./control.ts"
import { divider, message, messageList } from "./message.ts"

const Message = defineMessageUnion({
  OpenedThread: { key: Schema.String },
  ClickedEdit: { key: Schema.String },
  ClickedDelete: { key: Schema.String }
})
type Message = typeof Message.Type

type Model = Readonly<{ current: string; edits: number; deletions: number }>

const initial: Model = { current: "thread-2", edits: 0, deletions: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    OpenedThread: ({ key }) => ({ model: modifyFields(model, { current: () => key }) }),
    ClickedEdit: () => ({ model: modifyFields(model, { edits: (edits) => edits + 1 }) }),
    ClickedDelete: () => ({ model: modifyFields(model, { deletions: (deletions) => deletions + 1 }) })
  })

const viewOf = (render: (model: Model, h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Current ${model.current}, edits ${model.edits}, deletions ${model.deletions}`]),
      render(model, h)
    ]
  )

const threads = (model: Model, h: HtmlBuilder<Message>) =>
  messageList(h, {
    label: "Threads",
    children: [
      message(h, {
        key: "thread-1",
        mark: "AM",
        author: "Alex",
        time: "9:41 AM",
        text: "The preview is ready for another look.",
        onOpen: Message.OpenedThread({ key: "thread-1" }),
        isCurrent: model.current === "thread-1"
      }),
      message(h, {
        key: "thread-2",
        mark: "AJ",
        author: "AJ",
        time: "10:02 AM",
        note: "Sending…",
        text: "found a bug. composer crashes when I paste an image",
        onOpen: Message.OpenedThread({ key: "thread-2" }),
        isCurrent: model.current === "thread-2",
        meta: [h.span([], ["2 new"]), h.span([], ["Doing"])]
      })
    ]
  })

describe("messageList", () => {
  it("is a list named by its label with one item for each message", () => {
    scene(
      { update, view: viewOf(threads) },
      given(initial),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(within(role("list", { name: "Threads" }), role("listitem"))).toExist()
    )
  })
})

describe("message", () => {
  it("shows its author with the time after it, the note after that, and its text", () => {
    scene(
      { update, view: viewOf(threads) },
      given(initial),
      expect(text("Alex")).toExist(),
      expect(text("9:41 AM")).toExist(),
      expect(text("10:02 AM")).toExist(),
      expect(text(" · Sending…")).toExist(),
      expect(text("found a bug. composer crashes when I paste an image")).toExist()
    )
  })

  it("hides the mark from assistive technology", () => {
    scene(
      { update, view: viewOf(threads) },
      given(initial),
      expect(within(selector("li"), text("AM"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("shows no note, nor the dot before it, when it has none", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [
              message(h, { key: "message-1", mark: "A", author: "Alex", time: "9:41 AM", text: "Looks good." })
            ]
          })
        )
      },
      given(initial),
      expect(text("9:41 AM")).toExist(),
      expect(text(/·/)).toBeAbsent()
    )
  })

  it("makes its text a button named by it that sends onOpen, when it has one", () => {
    scene(
      { update, view: viewOf(threads) },
      given(initial),
      expect(role("button", { name: "The preview is ready for another look." })).toExist(),
      click(role("button", { name: "The preview is ready for another look." })),
      expect(role("status")).toHaveText("Current thread-1, edits 0, deletions 0")
    )
  })

  it("marks the current row with aria-current and no other", () => {
    scene(
      { update, view: viewOf(threads) },
      given(initial),
      expect(selector('[aria-current="true"]')).toExist(),
      expect(within(selector('[aria-current="true"]'), text("AJ"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Alex"))).toBeAbsent(),
      click(role("button", { name: "The preview is ready for another look." })),
      expect(within(selector('[aria-current="true"]'), text("Alex"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("AJ"))).toBeAbsent()
    )
  })

  it("lists what it knows under its text as meta", () => {
    scene(
      { update, view: viewOf(threads) },
      given(initial),
      expect(text("2 new")).toExist(),
      expect(text("Doing")).toExist()
    )
  })

  it("is plain text, not a button, without onOpen, with its actions as buttons at the end of the author line", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [
              message(h, {
                key: "message-1",
                mark: "Y",
                author: "Yumi",
                time: "10:03 AM",
                note: "edited",
                text: "Reproduced on both.",
                actions: [
                  button(h, "Edit", Message.ClickedEdit({ key: "message-1" }), { variant: "quiet" }),
                  button(h, "Delete", Message.ClickedDelete({ key: "message-1" }), { variant: "quiet" })
                ]
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Reproduced on both." })).toBeAbsent(),
      expect(text("Reproduced on both.")).toExist(),
      expect(text(" · edited")).toExist(),
      click(role("button", { name: "Edit" })),
      click(role("button", { name: "Delete" })),
      click(role("button", { name: "Delete" })),
      expect(role("status")).toHaveText("Current thread-2, edits 1, deletions 2")
    )
  })

  it("shows its body in place of its text", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [
              message(h, {
                key: "message-1",
                mark: "Y",
                author: "Yumi",
                text: "Reproduced on both.",
                body: h.form(
                  [h.AriaLabel("Edit message")],
                  [button(h, "Save", Message.ClickedEdit({ key: "message-1" }))]
                )
              })
            ]
          })
        )
      },
      given(initial),
      expect(role("form", { name: "Edit message" })).toExist(),
      expect(text("Reproduced on both.")).toBeAbsent(),
      expect(role("button", { name: "Save" })).toExist()
    )
  })
})

describe("divider", () => {
  const dividers = (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Messages",
      children: [
        divider(h, "Yesterday"),
        message(h, { key: "message-1", mark: "A", author: "Alex", text: "Looks good." }),
        divider(h, "4 replies", { align: "start" })
      ]
    })

  it("shows its label as an item of the list, centered or at the start", () => {
    scene(
      { update, view: viewOf(dividers) },
      given(initial),
      expect(within(role("list", { name: "Messages" }), text("Yesterday"))).toExist(),
      expect(within(role("list", { name: "Messages" }), text("4 replies"))).toExist()
    )
  })

  it("hides its rules from assistive technology", () => {
    scene(
      { update, view: viewOf(dividers) },
      given(initial),
      expect(within(selector("li"), selector('[aria-hidden="true"]'))).toExist()
    )
  })
})

import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button } from "./control.ts"
import { divider, message, messageList, notification, replyLine, type TextRun } from "./message.ts"

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

const mention = "@Jamie can you check the composer fix before we ship?"

/** The words of `mention` as runs: a mention of Jamie, then the words that follow it. */
const mentionRuns: ReadonlyArray<TextRun> = [
  { text: "@Jamie", isMention: true },
  { text: " can you check the composer fix before we ship?" }
]

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

  it("shows a mention in its text as a chip among the words, which read as one line", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [message(h, { key: "message-1", mark: "S", author: "Sara", text: mentionRuns })]
          })
        )
      },
      given(initial),
      expect(within(role("listitem"), text("@Jamie"))).toHaveClass("bg-mention"),
      expect(text(" can you check the composer fix before we ship?")).not.toHaveClass("bg-mention"),
      expect(text(mention)).toExist()
    )
  })

  it("shows runs of words alone as the text of a string, with no chip", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [message(h, { key: "message-1", mark: "A", author: "Alex", text: [{ text: "Looks good." }] })]
          })
        )
      },
      given(initial),
      expect(text("Looks good.")).toExist(),
      expect(text("Looks good.")).not.toHaveClass("bg-mention")
    )
  })

  it("makes text with a mention a button named by its words, with the mention a chip in it", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Threads",
            children: [
              message(h, {
                key: "thread-1",
                mark: "S",
                author: "Sara",
                text: mentionRuns,
                onOpen: Message.OpenedThread({ key: "thread-1" })
              })
            ]
          })
        )
      },
      given(initial),
      expect(within(role("button", { name: mention }), text("@Jamie"))).toHaveClass("bg-mention"),
      click(role("button", { name: mention })),
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

describe("notification", () => {
  type Options = Readonly<{
    place?: string
    text?: string | ReadonlyArray<TextRun>
    isUnread?: boolean
    isOpenable?: boolean
    isCurrent?: boolean
  }>

  const sara = (h: HtmlBuilder<Message>, options: Options) =>
    notification(h, {
      key: "notification-1",
      mark: "S",
      author: "Sara",
      activity: "mentioned you",
      ...(options.place === undefined ? {} : { place: options.place }),
      text: options.text ?? mention,
      age: "2m ago",
      ...(options.isUnread === true ? { isUnread: true } : {}),
      ...(options.isCurrent === true ? { isCurrent: true } : {}),
      ...(options.isOpenable === false ? {} : { onOpen: Message.OpenedThread({ key: "notification-1" }) })
    })

  const notifications =
    (options: Options = {}) =>
    (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, { label: "Notifications", children: [sara(h, options)] })

  it("is an item of the list under a divider, with the author, what they did, and the text", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => messageList(h, { label: "Notifications", children: [divider(h, "Today"), sara(h, {})] }))
      },
      given(initial),
      expect(within(role("list", { name: "Notifications" }), text("Today"))).toExist(),
      expect(within(role("list", { name: "Notifications" }), text("Sara"))).toExist(),
      expect(text(" mentioned you")).toExist(),
      expect(text(mention)).toExist()
    )
  })

  it("hides the mark from assistive technology", () => {
    scene(
      { update, view: viewOf(notifications()) },
      given(initial),
      expect(within(selector("li"), text("S"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("shows its age at the end of the first line", () => {
    scene({ update, view: viewOf(notifications()) }, given(initial), expect(text("2m ago")).toExist())
  })

  it("shows its place under the first line, and nothing without one", () => {
    scene(
      { update, view: viewOf(notifications({ place: "#general" })) },
      given(initial),
      expect(text("#general")).toExist()
    )
    scene({ update, view: viewOf(notifications()) }, given(initial), expect(text("#general")).toBeAbsent())
  })

  it("makes its text a button named by the author and the activity and described by the text, which sends onOpen", () => {
    scene(
      { update, view: viewOf(notifications()) },
      given(initial),
      expect(role("button", { name: "Sara mentioned you" })).toExist(),
      expect(role("button", { name: "Sara mentioned you" })).toHaveAttr("aria-description", mention),
      expect(role("button", { name: mention })).toBeAbsent(),
      click(role("button", { name: "Sara mentioned you" })),
      expect(role("status")).toHaveText("Current notification-1, edits 0, deletions 0")
    )
  })

  it("shows a mention in its text as a chip, and describes the button that opens it by the words joined", () => {
    scene(
      { update, view: viewOf(notifications({ text: mentionRuns })) },
      given(initial),
      expect(within(role("button", { name: "Sara mentioned you" }), text("@Jamie"))).toHaveClass("bg-mention"),
      expect(role("button", { name: "Sara mentioned you" })).toHaveAttr("aria-description", mention),
      expect(text(mention)).toExist(),
      click(role("button", { name: "Sara mentioned you" })),
      expect(role("status")).toHaveText("Current notification-1, edits 0, deletions 0")
    )
  })

  it("shows a mention as a chip in the text of one that is not a button", () => {
    scene(
      { update, view: viewOf(notifications({ text: mentionRuns, isOpenable: false })) },
      given(initial),
      expect(within(role("listitem"), text("@Jamie"))).toHaveClass("bg-mention"),
      expect(text(mention)).toExist()
    )
  })

  it("is plain text, not a button, without onOpen", () => {
    scene(
      { update, view: viewOf(notifications({ isOpenable: false })) },
      given(initial),
      expect(role("button", { name: "Sara mentioned you" })).toBeAbsent(),
      expect(text(mention)).toExist()
    )
  })

  it("shows an unread one with a dot hidden from assistive technology, and Unread said before the age", () => {
    scene(
      { update, view: viewOf(notifications({ isUnread: true })) },
      given(initial),
      expect(text("Unread")).toExist(),
      expectAll(all.selector('[aria-hidden="true"]')).toHaveCount(2)
    )
  })

  it("shows one that is not unread with neither the dot nor Unread", () => {
    scene(
      { update, view: viewOf(notifications()) },
      given(initial),
      expect(text("Unread")).toBeAbsent(),
      expectAll(all.selector('[aria-hidden="true"]')).toHaveCount(1)
    )
  })

  it("marks the current row with aria-current, as a message's, and no other", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Notifications",
            children: [
              sara(h, { isCurrent: true }),
              notification(h, {
                key: "notification-2",
                mark: "A",
                author: "Alex",
                activity: "replied",
                text: "Looks good.",
                age: "1h ago"
              })
            ]
          })
        )
      },
      given(initial),
      expectAll(all.selector('[aria-current="true"]')).toHaveCount(1),
      expect(within(selector('[aria-current="true"]'), text("Sara"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Alex"))).toBeAbsent()
    )
  })

  it("marks no row current unless it is, and keeps its text and dot when it is", () => {
    scene({ update, view: viewOf(notifications()) }, given(initial), expect(selector("[aria-current]")).toBeAbsent())
    scene(
      { update, view: viewOf(notifications({ isCurrent: true, isUnread: true })) },
      given(initial),
      expect(within(selector('[aria-current="true"]'), text("Unread"))).toExist(),
      click(within(selector('[aria-current="true"]'), role("button", { name: "Sara mentioned you" }))),
      expect(role("status")).toHaveText("Current notification-1, edits 0, deletions 0")
    )
  })
})

describe("replyLine", () => {
  const withReplies = (marks: ReadonlyArray<string>, label: string) => (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Threads",
      children: [
        message(h, {
          key: "thread-1",
          mark: "AJ",
          author: "AJ",
          time: "10:02 AM",
          text: "found a bug. composer crashes when I paste an image",
          meta: [replyLine(h, { marks, label })]
        })
      ]
    })

  it("shows the marks of those who replied and what it says of the replies, under the message's text", () => {
    scene(
      { update, view: viewOf(withReplies(["AM", "Y", "S"], "4 replies")) },
      given(initial),
      expect(within(role("listitem"), text("4 replies"))).toExist(),
      expect(within(role("listitem"), text("AM"))).toExist(),
      expect(within(role("listitem"), text("Y"))).toExist(),
      expect(within(role("listitem"), text("S"))).toExist(),
      expect(text(/^\+\d+$/)).toBeAbsent()
    )
  })

  it("hides its tree line and its marks from assistive technology, and leaves its label to be read", () => {
    scene(
      { update, view: viewOf(withReplies(["AM", "Y", "S"], "4 replies")) },
      given(initial),
      expect(text("Y")).toHaveAttr("aria-hidden", "true"),
      expectAll(all.selector('[aria-hidden="true"]')).toHaveCount(5),
      expect(text("4 replies")).not.toHaveAttr("aria-hidden", "true")
    )
  })

  it("shows the first three marks and counts the rest after them", () => {
    scene(
      { update, view: viewOf(withReplies(["AM", "Y", "S", "O", "G"], "9 replies")) },
      given(initial),
      expect(text("S")).toExist(),
      expect(text("O")).toBeAbsent(),
      expect(text("G")).toBeAbsent(),
      expect(text("+2")).toHaveAttr("aria-hidden", "true"),
      expect(text("9 replies")).toExist()
    )
  })

  it("shows one mark for one reply", () => {
    scene(
      { update, view: viewOf(withReplies(["Y"], "1 reply")) },
      given(initial),
      expect(text("Y")).toExist(),
      expectAll(all.selector('[aria-hidden="true"]')).toHaveCount(3),
      expect(text("1 reply")).toExist()
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

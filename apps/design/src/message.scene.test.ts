import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button } from "./control.ts"
import { log, turnStatus } from "./details.ts"
import type { MarkContent } from "./mark.ts"
import {
  description,
  divider,
  event,
  message,
  messageList,
  type MessageText,
  note,
  notification,
  repliesButton,
  replyInThreadButton,
  taskChip,
  turnLog,
  turnRow
} from "./message.ts"

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

/** `mention` as the markdown of a message's text, with the mention of Jamie that core writes. */
const mentionText: MessageText = {
  text: "[@Jamie](member:jamie) can you check the composer fix before we ship?",
  mentions: [{ id: "jamie", name: "Jamie" }]
}

const formatted: MessageText = {
  text: "# Release notes\n\n**Shipped** it, see [the docs](https://example.com):\n\n- one\n- `two`\n\n> Ready.",
  mentions: []
}

const formattedWords = "Release notes Shipped it, see the docs: one two Ready."

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
        isCurrent: model.current === "thread-1",
        meta: [replyInThreadButton(h, { onClick: Message.OpenedThread({ key: "thread-1" }) })]
      }),
      message(h, {
        key: "thread-2",
        mark: "AJ",
        author: "AJ",
        time: "10:02 AM",
        note: "Sending…",
        text: "found a bug. composer crashes when I paste an image",
        isCurrent: model.current === "thread-2",
        meta: [
          h.span([], ["2 new"]),
          h.span([], ["Doing"]),
          replyInThreadButton(h, { onClick: Message.OpenedThread({ key: "thread-2" }) })
        ]
      })
    ]
  })

describe("messageList", () => {
  it("has the id it is given, for a Command to find, and none unless it is given one", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          h.div(
            [],
            [
              messageList(h, { label: "Threads", id: "threads-general", children: [] }),
              messageList(h, { label: "Replies", children: [] })
            ]
          )
        )
      },
      given(initial),
      expect(role("list", { name: "Threads" })).toHaveAttr("id", "threads-general"),
      expect(role("list", { name: "Replies" })).not.toHaveAttr("id")
    )
  })

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

  it("shows a mention in its text as a chip among the words, which read as one line", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [message(h, { key: "message-1", mark: "S", author: "Sara", text: mentionText })]
          })
        )
      },
      given(initial),
      expect(within(role("listitem"), text("@Jamie"))).toHaveClass("bg-mention"),
      expect(text(" can you check the composer fix before we ship?")).not.toHaveClass("bg-mention"),
      expect(text(mention)).toExist()
    )
  })

  it("shows a string as the words it is, whatever markdown it holds, with no chip", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [message(h, { key: "message-1", mark: "A", author: "Alex", text: "**Looks** good." })]
          })
        )
      },
      given(initial),
      expect(text("**Looks** good.")).toExist(),
      expect(selector("strong")).toBeAbsent(),
      expect(text("**Looks** good.")).not.toHaveClass("bg-mention")
    )
  })

  it("shows markdown as the blocks richText makes of it, in the size of a message's text", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [message(h, { key: "message-1", mark: "S", author: "Sara", text: formatted })]
          })
        )
      },
      given(initial),
      expect(selector("strong")).toHaveText("Shipped"),
      expect(selector("a")).toHaveAttr("href", "https://example.com"),
      expect(selector("blockquote")).toHaveText("Ready."),
      expectAll(all.selector("ul li")).toHaveCount(2),
      expect(selector("code")).toHaveText("two"),
      expect(text("Release notes")).toHaveClass("font-semibold"),
      expect(role("button")).toBeAbsent(),
      expect(selector("li div.text-body")).toHaveClass("text-ink")
    )
  })

  it("marks the current row with aria-current and no other", () => {
    scene(
      { update, view: viewOf(threads) },
      given(initial),
      expect(selector('[aria-current="true"]')).toExist(),
      expect(within(selector('[aria-current="true"]'), text("AJ"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Alex"))).toBeAbsent(),
      click(within(nth(all.role("listitem"), 0), role("button", { name: "Reply in thread" }))),
      expect(within(selector('[aria-current="true"]'), text("Alex"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("AJ"))).toBeAbsent()
    )
  })

  it("draws a person's mark on the slate ground, and an agent's on the lilac with its name in the agent's color", () => {
    const authors = (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, {
        label: "Messages",
        children: [
          message(h, { key: "sara", mark: "S", author: "Sara", text: "Looks good." }),
          message(h, { key: "yumi", mark: "Y", author: "Yumi", isAgent: true, text: "Checked the build." })
        ]
      })

    scene(
      { update, view: viewOf(authors) },
      given(initial),
      expect(text("S")).toHaveClass("bg-avatar-slate-bg"),
      expect(text("S")).toHaveClass("text-avatar-slate-fg"),
      expect(text("S")).toHaveClass("size-8"),
      expect(text("Sara")).toHaveClass("text-ink"),
      expect(text("Sara")).not.toHaveClass("text-agent"),
      expect(text("Y")).toHaveClass("bg-avatar-lilac-bg"),
      expect(text("Y")).toHaveClass("text-avatar-lilac-fg"),
      expect(text("Yumi")).toHaveClass("text-agent"),
      expect(text("Yumi")).not.toHaveClass("text-ink")
    )
  })

  it("puts the attributes it is given on its row", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [
              message(h, {
                key: "message-1",
                mark: "S",
                author: "Sara",
                text: "Looks good.",
                attributes: [h.DataAttribute("probe", "")]
              })
            ]
          })
        )
      },
      given(initial),
      expect(selector("li")).toHaveAttr("data-probe", "")
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

  it("is plain text, not a button, with its actions as buttons at the end of the author line", () => {
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
                note: "Sending…",
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
      expect(text(" · Sending…")).toExist(),
      click(role("button", { name: "Edit" })),
      click(role("button", { name: "Delete" })),
      click(role("button", { name: "Delete" })),
      expect(role("status")).toHaveText("Current thread-2, edits 1, deletions 2")
    )
  })

  it("shows (edited) quietly after its text while it says it is edited, and nothing after an unedited one", () => {
    const edited = (isEdited: boolean) => (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, {
        label: "Messages",
        children: [
          message(h, {
            key: "message-1",
            mark: "Y",
            author: "Yumi",
            time: "10:03 AM",
            text: "Reproduced on both.",
            ...(isEdited ? { isEdited } : {})
          })
        ]
      })

    scene(
      { update, view: viewOf(edited(true)) },
      given(initial),
      expect(text(" (edited)")).toHaveClass("text-meta"),
      expect(text(" (edited)")).toHaveClass("text-ink-muted"),
      expect(selector("li div.text-body")).toHaveText("Reproduced on both. (edited)"),
      expect(text(/·/)).toBeAbsent()
    )
    scene(
      { update, view: viewOf(edited(false)) },
      given(initial),
      expect(text(" (edited)")).toBeAbsent(),
      expect(selector("li div.text-body")).toHaveText("Reproduced on both.")
    )
  })

  it("shows the words that say it was deleted quiet and slanted, in place of text", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Messages",
            children: [
              message(h, { key: "message-1", mark: "Y", author: "Yumi", text: { deleted: "Message deleted" } })
            ]
          })
        )
      },
      given(initial),
      expect(text("Message deleted")).toHaveClass("italic"),
      expect(text("Message deleted")).toHaveClass("text-ink-muted"),
      expect(role("button", { name: "Message deleted" })).toBeAbsent()
    )
  })

  describe("stacked under its author's message", () => {
    const stacking = (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, {
        label: "Messages",
        children: [
          message(h, { key: "first", mark: "S", author: "Sara", time: "9:44 AM", text: "deploy went out clean" }),
          message(h, {
            key: "second",
            mark: "S",
            author: "Sara",
            time: "9:46 AM",
            text: "and the numbers are up",
            isStacked: true,
            shortTime: "9:46"
          })
        ]
      })

    it("has no mark, and keeps the author and the time for assistive technology", () => {
      scene(
        { update, view: viewOf(stacking) },
        given(initial),
        expectAll(all.text("S")).toHaveCount(1),
        expectAll(all.text("Sara")).toHaveCount(2),
        expect(within(nth(all.role("listitem"), 1), selector("div.sr-only"))).toHaveText("Sara9:46 AM"),
        expect(within(nth(all.role("listitem"), 0), selector("div.sr-only"))).toBeAbsent(),
        expect(within(nth(all.role("listitem"), 1), text("and the numbers are up"))).toExist()
      )
    })

    it("shows its short time in the place of the mark, hidden from assistive technology and shown while hovered or focused", () => {
      scene(
        { update, view: viewOf(stacking) },
        given(initial),
        expect(text("9:46")).toHaveAttr("aria-hidden", "true"),
        expect(text("9:46")).toHaveClass("invisible"),
        expect(text("9:46")).toHaveClass("group-hover/message:visible"),
        expect(text("9:46")).toHaveClass("group-focus-within/message:visible"),
        expect(text("9:46")).toHaveClass("w-8")
      )
    })

    it("sits closer to the message above it than a message that stands on its own", () => {
      scene(
        { update, view: viewOf(stacking) },
        given(initial),
        expect(nth(all.role("listitem"), 1)).toHaveClass("-mt-1"),
        expect(nth(all.role("listitem"), 1)).toHaveClass("pt-0"),
        expect(nth(all.role("listitem"), 0)).not.toHaveClass("-mt-1")
      )
    })
  })

  describe("hover actions", () => {
    const hovering = (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, {
        label: "Threads",
        children: [
          message(h, {
            key: "thread-1",
            mark: "AM",
            author: "Alex",
            text: "The preview is ready for another look.",
            hoverActions: [
              {
                icon: "mark-reply",
                label: "Reply in thread",
                onClick: Message.OpenedThread({ key: "thread-1" }),
                description: "The preview is ready for another look."
              }
            ]
          }),
          message(h, { key: "thread-2", mark: "S", author: "Sara", text: "Looks good." })
        ]
      })

    it("are buttons in a group named Message actions, each named by its label and described by the words it opens", () => {
      scene(
        { update, view: viewOf(hovering) },
        given(initial),
        expectAll(all.role("group", { name: "Message actions" })).toHaveCount(1),
        expect(
          within(role("group", { name: "Message actions" }), role("button", { name: "Reply in thread" }))
        ).toHaveAttr("aria-description", "The preview is ready for another look."),
        click(role("button", { name: "Reply in thread" })),
        expect(role("status")).toHaveText("Current thread-1, edits 0, deletions 0")
      )
    })

    it("float over the end of the message's column, out of sight and out of reach until the message is hovered or focused", () => {
      scene(
        { update, view: viewOf(hovering) },
        given(initial),
        expect(role("group", { name: "Message actions" })).toHaveClass("absolute"),
        expect(role("group", { name: "Message actions" })).toHaveClass("opacity-0"),
        expect(role("group", { name: "Message actions" })).toHaveClass("pointer-events-none"),
        expect(role("group", { name: "Message actions" })).toHaveClass("group-hover/message:opacity-100"),
        expect(role("group", { name: "Message actions" })).toHaveClass("group-has-focus-visible/message:opacity-100")
      )
    })

    it("say what they do in a tooltip over the button, hidden from assistive technology", () => {
      scene(
        { update, view: viewOf(hovering) },
        given(initial),
        expect(within(role("group", { name: "Message actions" }), selector('span[aria-hidden="true"]'))).toHaveText(
          "Reply in thread"
        )
      )
    })

    it("say whether what they open is open, when they are told", () => {
      const withExpanded = (isExpanded: boolean) => (_: Model, h: HtmlBuilder<Message>) =>
        messageList(h, {
          label: "Threads",
          children: [
            message(h, {
              key: "thread-1",
              mark: "AM",
              author: "Alex",
              text: "The preview is ready for another look.",
              hoverActions: [
                {
                  icon: "mark-reply",
                  label: "Reply in thread",
                  onClick: Message.OpenedThread({ key: "thread-1" }),
                  isExpanded
                }
              ]
            })
          ]
        })

      scene(
        { update, view: viewOf(withExpanded(true)) },
        given(initial),
        expect(role("button", { name: "Reply in thread" })).toHaveAttr("aria-expanded", "true")
      )
      scene(
        { update, view: viewOf(withExpanded(false)) },
        given(initial),
        expect(role("button", { name: "Reply in thread" })).toHaveAttr("aria-expanded", "false")
      )
      scene(
        { update, view: viewOf(hovering) },
        given(initial),
        expect(role("button", { name: "Reply in thread" })).not.toHaveAttr("aria-expanded")
      )
    })

    it("are not drawn for a message that has none", () => {
      scene(
        { update, view: viewOf(hovering) },
        given(initial),
        expect(within(nth(all.role("listitem"), 1), role("group", { name: "Message actions" }))).toBeAbsent()
      )
    })
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
    text?: MessageText
    isUnread?: boolean
    isOpenable?: boolean
    isCurrent?: boolean
  }>

  const sara = (h: HtmlBuilder<Message>, options: Options) =>
    notification(h, {
      key: "notification-1",
      mark: { text: "S" },
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

  it("draws the author's letters on the neutral ground unless it is given a tone, as the lilac of an agent", () => {
    const marked = (content: MarkContent) => (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, {
        label: "Notifications",
        children: [
          notification(h, {
            key: "notification-1",
            mark: content,
            author: "Atlas",
            activity: "replied",
            text: "Done.",
            age: "1m ago"
          })
        ]
      })

    scene(
      { update, view: marked({ text: "S" }) },
      given(initial),
      expect(text("S")).toHaveClass("bg-avatar-neutral-bg"),
      expect(text("S")).toHaveClass("size-8")
    )
    scene(
      { update, view: marked({ text: "AT", tone: "lilac" }) },
      given(initial),
      expect(text("AT")).toHaveClass("bg-avatar-lilac-bg"),
      expect(text("AT")).toHaveClass("text-avatar-lilac-fg")
    )
  })

  it("draws an icon in place of letters for a notification that has no author to show, hidden from assistive technology", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          messageList(h, {
            label: "Notifications",
            children: [
              notification(h, {
                key: "notification-1",
                mark: { icon: "message" },
                author: "Activity",
                activity: "in a thread",
                text: "You can no longer see this thread.",
                age: "1m ago"
              })
            ]
          })
        )
      },
      given(initial),
      expect(within(selector("li"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(selector("li"), selector('span[aria-hidden="true"]'))).toHaveClass("size-8"),
      expect(text("Activity")).toExist(),
      expect(text(" in a thread")).toExist()
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
      { update, view: viewOf(notifications({ text: mentionText })) },
      given(initial),
      expect(within(role("button", { name: "Sara mentioned you" }), text("@Jamie"))).toHaveClass("bg-mention"),
      expect(role("button", { name: "Sara mentioned you" })).toHaveAttr("aria-description", mention),
      expect(text(mention)).toExist(),
      click(role("button", { name: "Sara mentioned you" })),
      expect(role("status")).toHaveText("Current notification-1, edits 0, deletions 0")
    )
  })

  it("describes the button that opens a deleted message's notification by the words that say so", () => {
    scene(
      { update, view: viewOf(notifications({ text: { deleted: "Message deleted" } })) },
      given(initial),
      expect(role("button", { name: "Sara mentioned you" })).toHaveAttr("aria-description", "Message deleted"),
      expect(text("Message deleted")).toHaveClass("italic"),
      expect(text("Message deleted")).toHaveClass("text-ink-muted")
    )
  })

  it("shows markdown as its preview, even when it is not a button", () => {
    scene(
      { update, view: viewOf(notifications({ text: formatted, isOpenable: false })) },
      given(initial),
      expect(role("button")).toBeAbsent(),
      expect(selector("li p")).toBeAbsent(),
      expect(selector("strong")).toBeAbsent(),
      expect(selector("a")).toBeAbsent(),
      expect(text(formattedWords)).toExist()
    )
    scene(
      { update, view: viewOf(notifications({ text: formatted })) },
      given(initial),
      expect(role("button", { name: "Sara mentioned you" })).toHaveAttr("aria-description", formattedWords)
    )
  })

  it("shows a mention as a chip in the text of one that is not a button", () => {
    scene(
      { update, view: viewOf(notifications({ text: mentionText, isOpenable: false })) },
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
                mark: { text: "A" },
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

describe("repliesButton", () => {
  type Replies = Parameters<typeof repliesButton<Message, never>>[1]

  const withReplies =
    (replies: Partial<Replies> = {}) =>
    (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, {
        label: "Threads",
        children: [
          message(h, {
            key: "thread-1",
            mark: "AJ",
            author: "AJ",
            time: "10:02 AM",
            text: "found a bug. composer crashes when I paste an image",
            meta: [
              repliesButton(h, {
                marks: [{ text: "AM" }, { text: "Y" }, { text: "S" }],
                label: "4 replies",
                onClick: Message.OpenedThread({ key: "thread-1" }),
                ...replies
              })
            ]
          })
        ]
      })

  it("is a button under the message's text, named by what it says of the replies, that sends its message", () => {
    scene(
      { update, view: viewOf(withReplies()) },
      given(initial),
      expect(within(role("listitem"), role("button", { name: "4 replies" }))).toExist(),
      expect(within(role("button", { name: "4 replies" }), text("4 replies"))).toExist(),
      click(role("button", { name: "4 replies" })),
      expect(role("status")).toHaveText("Current thread-1, edits 0, deletions 0")
    )
  })

  it("is described by the words of the thread it opens, when it has them", () => {
    scene(
      { update, view: viewOf(withReplies({ description: "found a bug" })) },
      given(initial),
      expect(role("button", { name: "4 replies" })).toHaveAttr("aria-description", "found a bug")
    )
    scene(
      { update, view: viewOf(withReplies()) },
      given(initial),
      expect(role("button", { name: "4 replies" })).not.toHaveAttr("aria-description")
    )
  })

  it("says whether its thread is open, when it is told", () => {
    scene(
      { update, view: viewOf(withReplies({ isExpanded: true })) },
      given(initial),
      expect(role("button", { name: "4 replies" })).toHaveAttr("aria-expanded", "true")
    )
    scene(
      { update, view: viewOf(withReplies({ isExpanded: false })) },
      given(initial),
      expect(role("button", { name: "4 replies" })).toHaveAttr("aria-expanded", "false")
    )
    scene(
      { update, view: viewOf(withReplies()) },
      given(initial),
      expect(role("button", { name: "4 replies" })).not.toHaveAttr("aria-expanded")
    )
  })

  it("shows a dot before the label while the replies are unread, and says so in its name", () => {
    scene(
      { update, view: viewOf(withReplies({ isUnread: true })) },
      given(initial),
      expect(role("button", { name: "4 replies, unread" })).toExist(),
      expect(within(role("button"), selector("span.bg-indicator"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button"), selector("span.bg-indicator"))).toHaveClass("rounded-full")
    )
    scene(
      { update, view: viewOf(withReplies()) },
      given(initial),
      expect(role("button", { name: "4 replies" })).toExist(),
      expect(selector("span.bg-indicator")).toBeAbsent()
    )
  })

  it("shows the marks of those who replied, on a person's tone unless they have their own", () => {
    scene(
      {
        update,
        view: viewOf(withReplies({ marks: [{ text: "AM" }, { text: "Y", tone: "lilac" }, { text: "S" }] }))
      },
      given(initial),
      expect(within(role("button"), text("AM"))).toHaveClass("bg-avatar-slate-bg"),
      expect(within(role("button"), text("Y"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button"), text("S"))).toHaveClass("bg-avatar-slate-bg"),
      expect(within(role("button"), text("S"))).toHaveClass("size-5.5"),
      expect(text(/^\+\d+$/)).toBeAbsent()
    )
  })

  it("hides its elbow and its marks from assistive technology, and leaves its label to be read", () => {
    scene(
      { update, view: viewOf(withReplies()) },
      given(initial),
      expect(text("Y")).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(text("4 replies")).not.toHaveAttr("aria-hidden", "true")
    )
  })

  it("hangs a stitched elbow from the row's mark", () => {
    scene(
      { update, view: viewOf(withReplies()) },
      given(initial),
      expect(within(role("button"), selector("svg"))).toHaveClass("text-stitch"),
      expect(within(role("button"), selector("svg"))).toHaveClass("absolute"),
      expect(within(role("button"), selector("svg path"))).toHaveAttr("stroke-dasharray", "7 4")
    )
  })

  it("shows the first three marks and counts the rest after them", () => {
    scene(
      {
        update,
        view: viewOf(
          withReplies({
            marks: [{ text: "AM" }, { text: "Y" }, { text: "S" }, { text: "O" }, { text: "G" }],
            label: "9 replies"
          })
        )
      },
      given(initial),
      expect(within(role("button"), text("S"))).toExist(),
      expect(text("O")).toBeAbsent(),
      expect(text("G")).toBeAbsent(),
      expect(text("+2")).toExist(),
      expect(text("9 replies")).toExist()
    )
  })

  it("counts the rest in its own span, beside the overlapping marks, and keeps its label on one line", () => {
    scene(
      {
        update,
        view: viewOf(
          withReplies({
            marks: [{ text: "AM" }, { text: "Y" }, { text: "S" }, { text: "O" }],
            label: "9 replies"
          })
        )
      },
      given(initial),
      expect(text("+1")).toHaveClass("text-ink-muted"),
      expect(text("9 replies")).toHaveClass("whitespace-nowrap")
    )
  })

  it("shows no marks while it does not know who replied", () => {
    scene(
      { update, view: viewOf(withReplies({ marks: [], label: "1 reply" })) },
      given(initial),
      expect(role("button", { name: "1 reply" })).toExist(),
      expect(within(role("button"), selector("span.bg-avatar-slate-bg"))).toBeAbsent()
    )
  })

  it("shows the agents at work in the thread and who types in it after the label, inside the button", () => {
    scene(
      {
        update,
        view: viewOf(
          withReplies({
            working: [
              { state: "working", label: "Yumi working" },
              { state: "queued", label: "Atlas queued" }
            ],
            typing: "Ada is typing…"
          })
        )
      },
      given(initial),
      expect(within(role("button", { name: "4 replies" }), text("Yumi working"))).toHaveClass("text-hint"),
      expect(within(role("button", { name: "4 replies" }), text("Atlas queued"))).toExist(),
      expect(within(role("button", { name: "4 replies" }), text("Ada is typing…"))).toHaveClass("text-ink-muted"),
      click(text("Ada is typing…")),
      expect(role("status")).toHaveText("Current thread-1, edits 0, deletions 0")
    )
  })

  it("says nothing of work or typing while there is none", () => {
    scene(
      { update, view: viewOf(withReplies()) },
      given(initial),
      expect(text(/working|queued|stopping|typing/)).toBeAbsent()
    )
  })
})

describe("replyInThreadButton", () => {
  type Reply = Parameters<typeof replyInThreadButton<Message, never>>[1]

  const withoutReplies =
    (reply: Partial<Reply> = {}) =>
    (_: Model, h: HtmlBuilder<Message>) =>
      messageList(h, {
        label: "Threads",
        children: [
          message(h, {
            key: "thread-1",
            mark: "AM",
            author: "Alex",
            text: "The preview is ready for another look.",
            meta: [replyInThreadButton(h, { onClick: Message.OpenedThread({ key: "thread-1" }), ...reply })]
          })
        ]
      })

  it("is a button named Reply in thread under the message's text, that sends its message", () => {
    scene(
      { update, view: viewOf(withoutReplies()) },
      given(initial),
      expect(within(role("listitem"), role("button", { name: "Reply in thread" }))).toExist(),
      click(role("button", { name: "Reply in thread" })),
      expect(role("status")).toHaveText("Current thread-1, edits 0, deletions 0")
    )
  })

  it("is described by the words of the thread it opens, when it has them", () => {
    scene(
      { update, view: viewOf(withoutReplies({ description: "The preview is ready" })) },
      given(initial),
      expect(role("button", { name: "Reply in thread" })).toHaveAttr("aria-description", "The preview is ready")
    )
  })

  it("says whether its thread is open, when it is told", () => {
    scene(
      { update, view: viewOf(withoutReplies({ isExpanded: true })) },
      given(initial),
      expect(role("button", { name: "Reply in thread" })).toHaveAttr("aria-expanded", "true")
    )
    scene(
      { update, view: viewOf(withoutReplies()) },
      given(initial),
      expect(role("button", { name: "Reply in thread" })).not.toHaveAttr("aria-expanded")
    )
  })

  it("shows its words only where there is no pointer to hover, and is not there at all where there is, with nothing to say", () => {
    scene(
      { update, view: viewOf(withoutReplies()) },
      given(initial),
      expect(role("button", { name: "Reply in thread" })).toHaveClass("[@media(hover:hover)]:not-data-noted:hidden"),
      expect(role("button", { name: "Reply in thread" })).not.toHaveAttr("data-noted"),
      expect(within(role("button"), text("Reply in thread"))).toHaveClass("[@media(hover:hover)]:hidden")
    )
  })

  it("stays where there is a pointer while an agent is at work or someone types, saying so without its words", () => {
    scene(
      {
        update,
        view: viewOf(withoutReplies({ working: [{ state: "working", label: "Yumi working" }] }))
      },
      given(initial),
      expect(role("button", { name: "Reply in thread" })).toHaveAttr("data-noted", ""),
      expect(within(role("button"), text("Yumi working"))).toExist()
    )
    scene(
      { update, view: viewOf(withoutReplies({ typing: "Ada is typing…" })) },
      given(initial),
      expect(role("button", { name: "Reply in thread" })).toHaveAttr("data-noted", ""),
      expect(within(role("button"), text("Ada is typing…"))).toExist(),
      click(text("Ada is typing…")),
      expect(role("status")).toHaveText("Current thread-1, edits 0, deletions 0")
    )
  })
})

describe("taskChip", () => {
  const tracking = (title: string) => (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Threads",
      children: [
        message(h, {
          key: "thread-1",
          mark: "AM",
          author: "Alex",
          text: "The preview is ready for another look.",
          meta: [
            taskChip(h, {
              shape: "progress",
              status: "Doing",
              title,
              onClick: Message.OpenedThread({ key: "thread-1" })
            })
          ]
        })
      ]
    })

  it("is a button under the message's text, named by the task's title and its status, that sends its message", () => {
    scene(
      { update, view: viewOf(tracking("Composer paste crash")) },
      given(initial),
      expect(within(role("listitem"), role("button", { name: "Composer paste crash, Doing" }))).toExist(),
      click(role("button", { name: "Composer paste crash, Doing" })),
      expect(role("status")).toHaveText("Current thread-1, edits 0, deletions 0")
    )
  })

  it("draws where the task stands before the title, hidden from assistive technology", () => {
    scene(
      { update, view: viewOf(tracking("Composer paste crash")) },
      given(initial),
      expect(within(role("button"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button"), selector("svg"))).toHaveAttr("width", "0.9375rem"),
      expect(within(role("button"), text("Composer paste crash"))).toHaveClass("truncate")
    )
  })

  it("is bordered on the panel, in the size of a hint, and has no task key", () => {
    scene(
      { update, view: viewOf(tracking("Composer paste crash")) },
      given(initial),
      expect(role("button")).toHaveClass("border-outline"),
      expect(role("button")).toHaveClass("bg-panel"),
      expect(role("button")).toHaveClass("text-hint"),
      expect(role("button")).toHaveText("Composer paste crash")
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

describe("event", () => {
  const events = (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Activity",
      children: [
        divider(h, "Activity", { align: "start" }),
        event(h, { key: "created", text: "Alex created this task · 10:06 AM" }),
        message(h, { key: "message-1", mark: "S", author: "Sara", text: "I can reproduce it." })
      ]
    })

  it("is a quiet line of what happened, an item of the list among its messages", () => {
    scene(
      { update, view: viewOf(events) },
      given(initial),
      expect(within(role("list", { name: "Activity" }), text("Alex created this task · 10:06 AM"))).toHaveClass(
        "text-ink-secondary"
      ),
      expect(text("Alex created this task · 10:06 AM")).toHaveClass("text-control"),
      expect(text("Alex created this task · 10:06 AM")).toHaveClass("gap-2.5"),
      expect(text("I can reproduce it.")).toExist()
    )
  })

  it("draws the drawing of something new at 0.875rem before the words, hidden from assistive technology", () => {
    scene(
      { update, view: viewOf(events) },
      given(initial),
      expect(within(selector("li.text-ink-secondary"), selector("span[aria-hidden]"))).toExist(),
      expect(within(selector("li.text-ink-secondary"), selector("svg"))).toHaveAttr("aria-hidden", "true")
    )
  })
})

describe("description", () => {
  const described = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        description(h, {
          text: {
            text: "Ask [@Jamie](member:jamie) about the 5 MB limit.\nThen test it.",
            mentions: [{ id: "jamie", name: "Jamie" }]
          },
          isCurrent: model.current === "thread-2",
          actions: [button(h, "Edit", Message.ClickedEdit({ key: "opening" }), { variant: "quiet" })]
        })
      ]
    )

  it("shows its markdown in the size of an item and in ink, its line breaks kept, a mention in it a chip", () => {
    scene(
      { update, view: viewOf(described) },
      given(initial),
      expect(selector("[aria-current] div")).toHaveClass("text-item"),
      expect(selector("[aria-current] div")).toHaveClass("text-ink"),
      expect(selector("[aria-current] div")).toHaveClass("mt-2.75"),
      expect(selector("p br")).toExist(),
      expect(text("@Jamie")).toHaveClass("bg-mention")
    )
  })

  it("shows the words that say it was deleted quiet and slanted", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => description(h, { text: { deleted: "Message deleted" } }))
      },
      given(initial),
      expect(text("Message deleted")).toHaveClass("italic"),
      expect(text("Message deleted")).toHaveClass("text-ink-muted")
    )
  })

  it("shows a string as the words it is", () => {
    scene(
      { update, view: viewOf((_, h) => description(h, { text: "Ask *about* the limit." })) },
      given(initial),
      expect(text("Ask *about* the limit.")).toExist(),
      expect(selector("em")).toBeAbsent()
    )
  })

  it("puts the attributes it is given on itself", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          description(h, { text: "Ask about the limit.", attributes: [h.DataAttribute("probe", "")] })
        )
      },
      given(initial),
      expect(selector("[data-probe]")).toHaveText("Ask about the limit.")
    )
  })

  it("is current while it says so, filled with the bar, and reaches into the gutter", () => {
    scene(
      { update, view: viewOf(described) },
      given(initial),
      expect(selector("[aria-current]")).toHaveAttr("aria-current", "true"),
      expect(selector("[aria-current]")).toHaveClass("-mx-3"),
      expect(selector("[aria-current]")).toHaveClass("aria-[current=true]:bg-selected"),
      expect(selector("[aria-current]")).toHaveClass("aria-[current=true]:indicator-bar")
    )
    scene(
      { update, view: viewOf(described) },
      given({ ...initial, current: "other" }),
      expect(selector("[aria-current]")).toBeAbsent()
    )
  })

  it("holds quiet actions under the text, which send their messages", () => {
    scene(
      { update, view: viewOf(described) },
      given(initial),
      click(role("button", { name: "Edit" })),
      expect(role("status")).toHaveText("Current thread-2, edits 1, deletions 0")
    )
  })

  it("shows its body in place of its text while one is given, as the form that changes it does", () => {
    scene(
      {
        update,
        view: viewOf((_, h) =>
          description(h, { text: "Ask about the limit.", body: h.p([], ["The form that changes it"]) })
        )
      },
      given(initial),
      expect(text("The form that changes it")).toExist(),
      expect(text("Ask about the limit.")).toBeAbsent()
    )
  })
})

describe("note", () => {
  const notes = (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Activity",
      children: [
        message(h, { key: "message-1", mark: "S", author: "Sara", text: "I can reproduce it." }),
        note(h, {
          key: "followed",
          text: "Sara followed this thread",
          time: "10:02 AM",
          dateTime: "2026-10-20T10:02:00.000Z",
          title: "Tuesday, October 20, 2026 at 10:02 AM"
        }),
        note(h, { key: "stopped", text: "You stopped following", time: "10:30 AM" })
      ]
    })

  it("is a quiet line of who took part, an item of the list among its messages", () => {
    scene(
      { update, view: viewOf(notes) },
      given(initial),
      expect(within(role("list", { name: "Activity" }), text("Sara followed this thread"))).toExist(),
      expect(text("Sara followed this thread")).toHaveClass("text-ink-secondary"),
      expect(text("Sara followed this thread")).toHaveClass("text-control"),
      expect(text("Sara followed this thread")).toHaveClass("gap-2.5"),
      expect(text("I can reproduce it.")).toExist()
    )
  })

  it("has its time after the words, at meta size in muted ink", () => {
    scene(
      { update, view: viewOf(notes) },
      given(initial),
      expect(text("10:02 AM")).toHaveClass("text-meta"),
      expect(text("10:02 AM")).toHaveClass("text-ink-muted"),
      expect(text("10:30 AM")).toExist()
    )
  })

  it("shows its time as a time element, whether or not it is given the moment it was", () => {
    scene(
      { update, view: viewOf(notes) },
      given(initial),
      expectAll(all.selector("time")).toHaveCount(2),
      expect(within(selector("time"), text("10:02 AM"))).toExist()
    )
  })

  it("draws nothing before its words, which sets it apart from an event", () => {
    scene(
      { update, view: viewOf(notes) },
      given(initial),
      expect(within(selector("li.text-ink-secondary"), selector("svg"))).toBeAbsent()
    )
  })
})

describe("turnRow", () => {
  const turn = (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Thread",
      children: [
        turnRow(h, {
          key: "turn-1",
          label: "Atlas's turn",
          mark: "A",
          name: "Atlas",
          status: turnStatus(h, "failed"),
          actions: [
            button(h, "View log", Message.OpenedThread({ key: "log" }), { variant: "quiet" }),
            button(h, "Retry", Message.ClickedEdit({ key: "turn-1" }))
          ],
          detail: "The model provider is unavailable.",
          problem: "Couldn't start another attempt. Try again.",
          children: [log(h, { label: "Log", items: ["Read 3 messages"] })]
        })
      ]
    })

  const bare = (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Thread",
      children: [
        turnRow(h, {
          key: "turn-2",
          label: "Atlas's turn",
          mark: "A",
          name: "Atlas",
          status: turnStatus(h, "queued"),
          actions: []
        })
      ]
    })

  it("is an item of the list, a group named for the agent's turn", () => {
    scene(
      { update, view: viewOf(turn) },
      given(initial),
      expect(within(role("list", { name: "Thread" }), role("group", { name: "Atlas's turn" }))).toExist()
    )
  })

  it("has the agent's mark at 24px in its tone, its name in the agent's color, and its state after the name", () => {
    scene(
      { update, view: viewOf(turn) },
      given(initial),
      expect(text("A")).toHaveClass("size-6"),
      expect(text("A")).toHaveClass("bg-avatar-lilac-bg"),
      expect(text("Atlas")).toHaveClass("text-agent"),
      expect(text("Atlas")).toHaveClass("font-medium"),
      expect(text("Atlas")).toHaveClass("text-item"),
      expect(within(role("group", { name: "Atlas's turn" }), role("status"))).toHaveText("Failed")
    )
  })

  it("lays its mark, who it is, and its actions out in three columns, the actions under the name on a narrow row", () => {
    scene(
      { update, view: viewOf(turn) },
      given(initial),
      expect(role("group", { name: "Atlas's turn" })).toHaveClass("grid-cols-[1.5rem_minmax(0,1fr)_auto]"),
      expect(role("group", { name: "Atlas's turn" })).toHaveClass("@max-[22.5rem]:grid-cols-[1.5rem_minmax(0,1fr)]"),
      expect(selector("li")).toHaveClass("@container"),
      expect(role("button", { name: "Retry" })).toExist(),
      expect(role("button", { name: "View log" })).toExist()
    )
  })

  it("says how the turn ended and why a stop or retry did not go through, under the first line", () => {
    scene(
      { update, view: viewOf(turn) },
      given(initial),
      expect(text("The model provider is unavailable.")).toHaveClass("text-ink-secondary"),
      expect(text("The model provider is unavailable.")).toHaveClass("col-[2/-1]"),
      expect(role("alert")).toHaveText("Couldn't start another attempt. Try again."),
      expect(role("alert")).toHaveClass("text-caution-text")
    )
  })

  it("holds its children, such as the log, under all that", () => {
    scene(
      { update, view: viewOf(turn) },
      given(initial),
      expect(within(role("group", { name: "Atlas's turn" }), role("list", { name: "Log" }))).toExist()
    )
  })

  it("has no line, alert, or actions of its own when it has nothing to say or do", () => {
    scene(
      { update, view: viewOf(bare) },
      given(initial),
      expect(role("alert")).toBeAbsent(),
      expect(role("button")).toBeAbsent(),
      expect(within(role("group", { name: "Atlas's turn" }), selector("p"))).toBeAbsent()
    )
  })
})

describe("turnLog", () => {
  const logged = (_: Model, h: HtmlBuilder<Message>) =>
    messageList(h, {
      label: "Thread",
      children: [
        message(h, { key: "reply", mark: "A", author: "Atlas", text: "Deploy the API first." }),
        turnLog(h, {
          key: "reply-log",
          label: "Atlas's turn log",
          children: [log(h, { label: "Log", items: ["Read 3 messages", "Replied: Deploy the API first."] })]
        })
      ]
    })

  it("is an item of the list under the message that was posted, a group in line with the message's text", () => {
    scene(
      { update, view: viewOf(logged) },
      given(initial),
      expect(within(role("list", { name: "Thread" }), role("group", { name: "Atlas's turn log" }))).toExist(),
      expect(nth(all.role("listitem"), 1)).toHaveClass("ps-11"),
      expect(nth(all.role("listitem"), 1)).toHaveClass("pb-2.5"),
      expect(within(role("group", { name: "Atlas's turn log" }), role("list", { name: "Log" }))).toExist(),
      expect(text("Read 3 messages")).toExist()
    )
  })
})

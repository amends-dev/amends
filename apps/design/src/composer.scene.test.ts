import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  all,
  click,
  expect,
  expectAll,
  expectHandled,
  expectIgnored,
  given,
  keydown,
  label,
  role,
  scene,
  selector,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { composer } from "./composer.ts"

const Message = defineMessageUnion({ TypedReply: { value: Schema.String }, SubmittedReply: {} })
type Message = typeof Message.Type

type Model = Readonly<{ reply: string; submissions: number }>

const initial: Model = { reply: "", submissions: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    SubmittedReply: () => ({ model: modifyFields(model, { submissions: (submissions) => submissions + 1 }) })
  })

const replyView = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Reply "${model.reply}", submitted ${model.submissions}`]),
      composer(h, {
        id: "reply",
        label: "Reply",
        placeholder: "Reply in thread",
        value: model.reply,
        onInput: (value) => Message.TypedReply({ value }),
        onSubmit: Message.SubmittedReply(),
        submitLabel: "Reply",
        attributes: [h.Spellcheck(false)]
      })
    ]
  )

describe("composer", () => {
  it("is a form named by its label, with a textarea found by that label and the placeholder while it is empty", () => {
    scene(
      { update, view: replyView },
      given(initial),
      expect(role("form", { name: "Reply" })).toExist(),
      expect(within(role("form", { name: "Reply" }), role("textbox", { name: "Reply" }))).toExist(),
      expect(label("Reply")).toHaveAttr("placeholder", "Reply in thread"),
      expect(role("textbox", { name: "Reply" })).toHaveValue("")
    )
  })

  it("keeps what is typed in the box, and sends the form with the button named for it", () => {
    scene(
      { update, view: replyView },
      given(initial),
      type(label("Reply"), "Will do"),
      expect(role("status")).toHaveText('Reply "Will do", submitted 0'),
      expect(role("textbox", { name: "Reply" })).toHaveValue("Will do"),
      click(role("button", { name: "Reply" })),
      expect(role("status")).toHaveText('Reply "Will do", submitted 1')
    )
  })

  it("hides the send icon from assistive technology, leaving the button named by its label", () => {
    scene(
      { update, view: replyView },
      given(initial),
      expect(within(role("button", { name: "Reply" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(role("button", { name: "Reply" })).toHaveAttr("type", "submit")
    )
  })

  it("makes the button unavailable while the box holds nothing, or only spaces, and available once it holds words", () => {
    scene(
      { update, view: replyView },
      given(initial),
      expect(role("button", { name: "Reply" })).toHaveAttr("aria-disabled", "true"),
      type(label("Reply"), "   "),
      expect(role("button", { name: "Reply" })).toHaveAttr("aria-disabled", "true"),
      type(label("Reply"), "Will do"),
      expect(role("button", { name: "Reply" })).not.toHaveAttr("aria-disabled"),
      type(label("Reply"), ""),
      expect(role("button", { name: "Reply" })).toHaveAttr("aria-disabled", "true")
    )
  })

  it("sends the form on Enter, keeping the browser from adding a line", () => {
    scene(
      { update, view: replyView },
      given(initial),
      type(label("Reply"), "Will do"),
      keydown(role("textbox", { name: "Reply" }), "Enter"),
      expectHandled(),
      expect(role("status")).toHaveText('Reply "Will do", submitted 1')
    )
  })

  it("leaves Enter with Shift to the browser, which adds a line, and with Control, Alt, or Meta, and other keys", () => {
    scene(
      { update, view: replyView },
      given(initial),
      type(label("Reply"), "Will do"),
      keydown(role("textbox", { name: "Reply" }), "Enter", { shiftKey: true }),
      expectIgnored(),
      keydown(role("textbox", { name: "Reply" }), "Enter", { ctrlKey: true }),
      expectIgnored(),
      keydown(role("textbox", { name: "Reply" }), "Enter", { altKey: true }),
      expectIgnored(),
      keydown(role("textbox", { name: "Reply" }), "Enter", { metaKey: true }),
      expectIgnored(),
      keydown(role("textbox", { name: "Reply" }), "a"),
      expectIgnored(),
      expect(role("status")).toHaveText('Reply "Will do", submitted 0')
    )
  })

  it("puts the attributes it is given onto the textarea", () => {
    scene(
      { update, view: replyView },
      given(initial),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("spellcheck", "false"),
      expect(role("form", { name: "Reply" })).not.toHaveAttr("spellcheck")
    )
  })
})

const members = [
  { id: "member-1", mark: { text: "AC" }, name: "Alice Chen" },
  { id: "member-2", mark: { text: "AM", tone: "lilac" as const }, name: "Alex Morgan" }
]

const Mention = defineMessageUnion({
  TypedReply: { value: Schema.String },
  SubmittedReply: {},
  PickedMember: { memberId: Schema.String },
  MovedActive: { to: Schema.Int },
  DismissedList: {}
})
type Mention = typeof Mention.Type

type MentionModel = Readonly<{ reply: string; active: number; isOpen: boolean; picked: string; sent: number }>

const typingMention: MentionModel = { reply: "Hi @al", active: 0, isOpen: true, picked: "no one", sent: 0 }

const mentionUpdate = (model: MentionModel, message: Mention) =>
  Mention.match<Update.Return<MentionModel, Mention>>(message, {
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    SubmittedReply: () => ({ model: modifyFields(model, { sent: (sent) => sent + 1 }) }),
    PickedMember: ({ memberId }) => ({ model: modifyFields(model, { picked: () => memberId, isOpen: () => false }) }),
    MovedActive: ({ to }) => ({ model: modifyFields(model, { active: () => to }) }),
    DismissedList: () => ({ model: modifyFields(model, { isOpen: () => false }) })
  })

const mentionView = (model: MentionModel, h: HtmlBuilder<Mention>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Picked ${model.picked}, active ${model.active}`]),
      h.p([h.Role("note"), h.AriaLabel("Sent")], [String(model.sent)]),
      composer(h, {
        id: "reply",
        label: "Reply",
        placeholder: "Reply in thread",
        value: model.reply,
        onInput: (value) => Mention.TypedReply({ value }),
        onSubmit: Mention.SubmittedReply(),
        submitLabel: "Reply",
        ...(model.isOpen
          ? {
              suggestions: {
                id: "reply-members",
                label: "People to mention",
                items: members.map((member, index) => ({
                  ...member,
                  isActive: index === model.active,
                  onPick: Mention.PickedMember({ memberId: member.id })
                })),
                onKeyDown: (key: string) =>
                  key === "ArrowDown"
                    ? Option.some(Mention.MovedActive({ to: (model.active + 1) % members.length }))
                    : key === "Enter"
                      ? Option.some(Mention.PickedMember({ memberId: members[model.active]!.id }))
                      : key === "Escape"
                        ? Option.some(Mention.DismissedList())
                        : Option.none()
              }
            }
          : {})
      })
    ]
  )

describe("composer mentioning", () => {
  it("opens a list of the members named for it over the box, a row for each with one active", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      expect(role("listbox", { name: "People to mention" })).toHaveId("reply-members"),
      expect(within(role("listbox", { name: "People to mention" }), role("option", { name: "Alice Chen" }))).toExist(),
      expect(within(role("listbox", { name: "People to mention" }), role("option", { name: "Alex Morgan" }))).toExist(),
      expect(role("option", { name: "Alice Chen" })).toHaveAttr("aria-selected", "true"),
      expect(role("option", { name: "Alex Morgan" })).toHaveAttr("aria-selected", "false"),
      expect(within(role("option", { name: "Alice Chen" }), selector("span"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("tells the textarea that it completes from the list and which row is active", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-autocomplete", "list"),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-controls", "reply-members"),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-expanded", "true"),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-activedescendant", "reply-members-member-1"),
      expect(role("option", { name: "Alice Chen" })).toHaveId("reply-members-member-1"),
      keydown(role("textbox", { name: "Reply" }), "ArrowDown"),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-activedescendant", "reply-members-member-2"),
      expect(role("option", { name: "Alex Morgan" })).toHaveAttr("aria-selected", "true"),
      expect(role("option", { name: "Alice Chen" })).toHaveAttr("aria-selected", "false")
    )
  })

  it("draws each person's mark at 22px in their tone, hidden from assistive technology", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      expect(within(role("option", { name: "Alice Chen" }), text("AC"))).toHaveClass("size-5.5"),
      expect(within(role("option", { name: "Alice Chen" }), text("AC"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("option", { name: "Alex Morgan" }), text("AM"))).toHaveClass("size-5.5"),
      expect(within(role("option", { name: "Alex Morgan" }), text("AM"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("option", { name: "Alex Morgan" }), text("AM"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("sends the pick of the row that is clicked", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      click(role("option", { name: "Alex Morgan" })),
      expect(role("status")).toHaveText("Picked member-2, active 0")
    )
  })

  it("keeps the keys the list answers from the textarea, and leaves the others and those with a modifier to it", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      keydown(role("textbox", { name: "Reply" }), "ArrowDown"),
      expectHandled(),
      expect(role("status")).toHaveText("Picked no one, active 1"),
      keydown(role("textbox", { name: "Reply" }), "a"),
      expectIgnored(),
      keydown(role("textbox", { name: "Reply" }), "Enter", { shiftKey: true }),
      expectIgnored(),
      keydown(role("textbox", { name: "Reply" }), "Enter"),
      expectHandled(),
      expect(role("status")).toHaveText("Picked member-2, active 1"),
      expect(role("listbox")).toBeAbsent()
    )
  })

  it("picks the active row on Enter, and does not send the form", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      keydown(role("textbox", { name: "Reply" }), "Enter"),
      expectHandled(),
      expect(role("status")).toHaveText("Picked member-1, active 0"),
      expect(role("note", { name: "Sent" })).toHaveText("0")
    )
  })

  it("sends the form on Enter once the list is closed", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given({ ...typingMention, isOpen: false }),
      keydown(role("textbox", { name: "Reply" }), "Enter"),
      expectHandled(),
      expect(role("note", { name: "Sent" })).toHaveText("1")
    )
  })

  it("closes the list on a key that dismisses it, and puts none of its attributes on the textarea", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      keydown(role("textbox", { name: "Reply" }), "Escape"),
      expectHandled(),
      expect(role("listbox")).toBeAbsent(),
      expect(role("option", { name: "Alice Chen" })).toBeAbsent(),
      expect(role("textbox", { name: "Reply" })).not.toHaveAttr("aria-autocomplete"),
      expect(role("textbox", { name: "Reply" })).not.toHaveAttr("aria-controls"),
      expect(role("textbox", { name: "Reply" })).not.toHaveAttr("aria-expanded"),
      expect(role("textbox", { name: "Reply" })).not.toHaveAttr("aria-activedescendant")
    )
  })

  it("keeps a person's list 16rem wide, and a command's as wide as the box", () => {
    scene(
      { update: mentionUpdate, view: mentionView },
      given(typingMention),
      expect(role("listbox", { name: "People to mention" })).toHaveClass("w-64"),
      expect(role("listbox", { name: "People to mention" })).not.toHaveClass("inset-x-0")
    )
  })
})

const Format = defineMessageUnion({
  TypedReply: { value: Schema.String },
  SubmittedReply: {},
  PressedFormat: { name: Schema.String },
  ToggledFormatting: {},
  PressedMention: {}
})
type Format = typeof Format.Type

type FormatModel = Readonly<{ reply: string; isShown: boolean; last: string }>

const formatting: FormatModel = { reply: "", isShown: true, last: "nothing" }

const formatUpdate = (model: FormatModel, message: Format) =>
  Format.match<Update.Return<FormatModel, Format>>(message, {
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    SubmittedReply: () => ({ model }),
    PressedFormat: ({ name }) => ({ model: modifyFields(model, { last: () => name }) }),
    ToggledFormatting: () => ({ model: modifyFields(model, { isShown: (isShown) => !isShown }) }),
    PressedMention: () => ({ model: modifyFields(model, { last: () => "mention" }) })
  })

const formatView = (model: FormatModel, h: HtmlBuilder<Format>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Last ${model.last}`]),
      composer(h, {
        id: "reply",
        label: "Reply",
        placeholder: "Reply in thread",
        value: model.reply,
        onInput: (value) => Format.TypedReply({ value }),
        onSubmit: Format.SubmittedReply(),
        submitLabel: "Send",
        formatting: {
          id: "reply-formatting",
          label: "Formatting",
          isShown: model.isShown,
          groups: [
            [
              {
                icon: "bold",
                label: "Bold",
                keys: "Control+B Meta+B",
                onClick: Format.PressedFormat({ name: "bold" })
              },
              { icon: "italic", label: "Italic", onClick: Format.PressedFormat({ name: "italic" }) }
            ],
            [{ icon: "link", label: "Link", onClick: Format.PressedFormat({ name: "link" }) }],
            [{ icon: "list", label: "Bulleted list", onClick: Format.PressedFormat({ name: "list" }) }]
          ],
          onToggle: Format.ToggledFormatting()
        },
        mention: { label: "Mention someone", onClick: Format.PressedMention() },
        onShortcut: (key, modifiers) =>
          key === "b" && (modifiers.ctrlKey || modifiers.metaKey)
            ? Option.some(Format.PressedFormat({ name: "bold" }))
            : Option.none()
      })
    ]
  )

describe("composer formatting", () => {
  it("is a toolbar named for it over the box, a compact button for each of its buttons, named by their labels", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given(formatting),
      expect(role("toolbar", { name: "Formatting" })).toHaveId("reply-formatting"),
      expect(within(role("toolbar", { name: "Formatting" }), role("button", { name: "Bold" }))).toExist(),
      expect(within(role("toolbar", { name: "Formatting" }), role("button", { name: "Italic" }))).toExist(),
      expect(within(role("toolbar", { name: "Formatting" }), role("button", { name: "Link" }))).toExist(),
      expect(within(role("toolbar", { name: "Formatting" }), role("button", { name: "Bulleted list" }))).toExist(),
      expect(role("button", { name: "Bold" })).toHaveClass("size-6"),
      expect(role("button", { name: "Bold" })).toHaveAttr("type", "button"),
      expect(within(role("button", { name: "Bold" }), selector("svg"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("says the keys that do what a button does, when it has some, and is not a switch", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given(formatting),
      expect(role("button", { name: "Bold" })).toHaveAttr("aria-keyshortcuts", "Control+B Meta+B"),
      expect(role("button", { name: "Italic" })).not.toHaveAttr("aria-keyshortcuts"),
      expect(role("button", { name: "Bold" })).not.toHaveAttr("aria-pressed")
    )
  })

  it("separates one group of buttons from the next by a rule that assistive technology skips", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given(formatting),
      expectAll(all.selector('[aria-hidden="true"].w-px')).toHaveCount(2),
      expect(within(role("toolbar", { name: "Formatting" }), selector('[aria-hidden="true"].w-px'))).toHaveClass("h-4")
    )
  })

  it("sends what a button sends", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given(formatting),
      click(role("button", { name: "Italic" })),
      expect(role("status")).toHaveText("Last italic"),
      click(role("button", { name: "Bold" })),
      expect(role("status")).toHaveText("Last bold")
    )
  })

  it("has a button before Send that is a switch for the toolbar, pressed while it is shown, controlling it", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given(formatting),
      expect(role("button", { name: "Formatting" })).toHaveAttr("aria-pressed", "true"),
      expect(role("button", { name: "Formatting" })).toHaveAttr("aria-controls", "reply-formatting"),
      expect(role("button", { name: "Formatting" })).toHaveClass("size-8"),
      click(role("button", { name: "Formatting" })),
      expect(role("button", { name: "Formatting" })).toHaveAttr("aria-pressed", "false"),
      click(role("button", { name: "Formatting" })),
      expect(role("button", { name: "Formatting" })).toHaveAttr("aria-pressed", "true")
    )
  })

  it("hides the toolbar while it is not shown, keeping it in the page for the switch to control", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given({ ...formatting, isShown: false }),
      expect(selector("#reply-formatting")).toHaveAttr("hidden"),
      expect(selector("#reply-formatting")).toHaveClass("hidden"),
      expect(selector("#reply-formatting")).not.toHaveClass("flex"),
      expect(role("button", { name: "Formatting" })).toHaveAttr("aria-pressed", "false"),
      click(role("button", { name: "Formatting" })),
      expect(selector("#reply-formatting")).not.toHaveAttr("hidden"),
      expect(selector("#reply-formatting")).toHaveClass("flex")
    )
  })

  it("starts a mention with a button named for it, beside the switch and Send", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given(formatting),
      click(role("button", { name: "Mention someone" })),
      expect(role("status")).toHaveText("Last mention"),
      expect(role("button", { name: "Mention someone" })).toHaveClass("size-8"),
      expect(role("button", { name: "Send" })).toHaveAttr("type", "submit"),
      expectAll(all.role("button")).toHaveCount(7)
    )
  })

  it("draws none of this without the config for it", () => {
    scene(
      { update, view: replyView },
      given(initial),
      expect(role("toolbar")).toBeAbsent(),
      expect(role("button", { name: "Formatting" })).toBeAbsent(),
      expect(role("button", { name: "Mention someone" })).toBeAbsent()
    )
  })

  it("asks for a key pressed with Control or Meta, and keeps the browser's action from a key it answers", () => {
    scene(
      { update: formatUpdate, view: formatView },
      given(formatting),
      keydown(role("textbox", { name: "Reply" }), "b", { ctrlKey: true }),
      expectHandled(),
      expect(role("status")).toHaveText("Last bold"),
      click(role("button", { name: "Italic" })),
      keydown(role("textbox", { name: "Reply" }), "b", { metaKey: true }),
      expectHandled(),
      expect(role("status")).toHaveText("Last bold"),
      click(role("button", { name: "Italic" })),
      keydown(role("textbox", { name: "Reply" }), "i", { ctrlKey: true }),
      expectIgnored(),
      keydown(role("textbox", { name: "Reply" }), "b"),
      expectIgnored(),
      expect(role("status")).toHaveText("Last italic")
    )
  })
})

const Commands = defineMessageUnion({
  TypedReply: { value: Schema.String },
  SubmittedReply: {},
  RanCommand: { name: Schema.String }
})
type Commands = typeof Commands.Type

type CommandsModel = Readonly<{ reply: string; ran: string }>

const commandsUpdate = (model: CommandsModel, message: Commands) =>
  Commands.match<Update.Return<CommandsModel, Commands>>(message, {
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    SubmittedReply: () => ({ model }),
    RanCommand: ({ name }) => ({ model: modifyFields(model, { ran: () => name }) })
  })

const commandsView = (model: CommandsModel, h: HtmlBuilder<Commands>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Ran ${model.ran}`]),
      composer(h, {
        id: "reply",
        label: "Message #general",
        placeholder: "Message #general",
        value: model.reply,
        onInput: (value) => Commands.TypedReply({ value }),
        onSubmit: Commands.SubmittedReply(),
        submitLabel: "Send",
        suggestions: {
          id: "reply-commands",
          label: "Commands",
          items: [
            {
              id: "follow",
              name: "/follow",
              description: "Follow #general to take part in its new threads",
              isActive: true,
              onPick: Commands.RanCommand({ name: "follow" })
            },
            {
              id: "rename",
              name: "/rename",
              description: "Rename #general",
              isActive: false,
              onPick: Commands.RanCommand({ name: "rename" })
            }
          ],
          onKeyDown: () => Option.none()
        }
      })
    ]
  )

describe("composer commands", () => {
  it("lists them in a list named for them, each row its name and, after it, what it does", () => {
    scene(
      { update: commandsUpdate, view: commandsView },
      given({ reply: "/", ran: "none" }),
      expect(role("listbox", { name: "Commands" })).toHaveId("reply-commands"),
      expect(within(role("option", { name: /^\/follow/u }), text("/follow"))).toHaveClass("font-medium"),
      expect(
        within(role("option", { name: /^\/follow/u }), text("Follow #general to take part in its new threads"))
      ).toHaveClass("text-ink-secondary"),
      expect(role("option", { name: /^\/follow/u })).toHaveAttr("aria-selected", "true"),
      expect(role("option", { name: /^\/rename/u })).toHaveAttr("aria-selected", "false")
    )
  })

  it("draws no mark before a command, and is as wide as the box where a person's list is 16rem", () => {
    scene(
      { update: commandsUpdate, view: commandsView },
      given({ reply: "/", ran: "none" }),
      expect(within(role("option", { name: /^\/follow/u }), selector("[aria-hidden]"))).toBeAbsent(),
      expect(role("listbox", { name: "Commands" })).toHaveClass("inset-x-0"),
      expect(role("listbox", { name: "Commands" })).not.toHaveClass("w-64")
    )
  })

  it("sends the pick of the row that is clicked, as it does for a person", () => {
    scene(
      { update: commandsUpdate, view: commandsView },
      given({ reply: "/", ran: "none" }),
      click(role("option", { name: /^\/rename/u })),
      expect(role("status")).toHaveText("Ran rename")
    )
  })
})

import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  click,
  expect,
  expectHandled,
  expectIgnored,
  given,
  keydown,
  label,
  role,
  scene,
  selector,
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
        submitLabel: "Reply"
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
})

const members = [
  { id: "member-1", mark: "AC", name: "Alice Chen" },
  { id: "member-2", mark: "AM", name: "Alex Morgan" }
]

const Mention = defineMessageUnion({
  TypedReply: { value: Schema.String },
  SubmittedReply: {},
  PickedMember: { memberId: Schema.String },
  MovedActive: { to: Schema.Int },
  DismissedList: {}
})
type Mention = typeof Mention.Type

type MentionModel = Readonly<{ reply: string; active: number; isOpen: boolean; picked: string }>

const typingMention: MentionModel = { reply: "Hi @al", active: 0, isOpen: true, picked: "no one" }

const mentionUpdate = (model: MentionModel, message: Mention) =>
  Mention.match<Update.Return<MentionModel, Mention>>(message, {
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    SubmittedReply: () => ({ model }),
    PickedMember: ({ memberId }) => ({ model: modifyFields(model, { picked: () => memberId, isOpen: () => false }) }),
    MovedActive: ({ to }) => ({ model: modifyFields(model, { active: () => to }) }),
    DismissedList: () => ({ model: modifyFields(model, { isOpen: () => false }) })
  })

const mentionView = (model: MentionModel, h: HtmlBuilder<Mention>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Picked ${model.picked}, active ${model.active}`]),
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
      expect(role("listbox", { name: "Members to mention" })).toHaveId("reply-members"),
      expect(within(role("listbox", { name: "Members to mention" }), role("option", { name: "Alice Chen" }))).toExist(),
      expect(
        within(role("listbox", { name: "Members to mention" }), role("option", { name: "Alex Morgan" }))
      ).toExist(),
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
      expect(role("textbox", { name: "Reply" })).not.toHaveAttr("aria-activedescendant"),
      expect(role("textbox", { name: "Reply" })).not.toHaveHandler("keydown")
    )
  })
})

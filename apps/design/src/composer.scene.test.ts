import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, label, role, scene, selector, type, within } from "foldkit/scene"
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

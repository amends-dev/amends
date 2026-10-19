import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, label, role, scene, submit, text, type, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button, field, submit as submitButton } from "./control.ts"
import { form, inline, valueWithAction } from "./form.ts"

const Message = defineMessageUnion({
  SubmittedCode: {},
  TypedCode: { value: Schema.String },
  ClickedSendAgain: {},
  ClickedChangeEmail: {}
})
type Message = typeof Message.Type

type Model = Readonly<{ code: string; submissions: number; resends: number; changes: number }>

const initial: Model = { code: "", submissions: 0, resends: 0, changes: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    SubmittedCode: () => ({ model: modifyFields(model, { submissions: (submissions) => submissions + 1 }) }),
    TypedCode: ({ value }) => ({ model: modifyFields(model, { code: () => value }) }),
    ClickedSendAgain: () => ({ model: modifyFields(model, { resends: (resends) => resends + 1 }) }),
    ClickedChangeEmail: () => ({ model: modifyFields(model, { changes: (changes) => changes + 1 }) })
  })

const viewOf =
  (render: (model: Model, h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        h.p([h.Role("status")], [`Submitted ${model.submissions}, resent ${model.resends}, changed ${model.changes}`]),
        ...render(model, h)
      ]
    )

describe("form", () => {
  it("holds its children and is found by its label, and submitting sends its message", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          form(h, { onSubmit: Message.SubmittedCode(), label: "Verify" }, [
            field(
              h,
              {
                id: "code",
                label: "Verification code",
                type: "text",
                value: model.code,
                onInput: (value) => Message.TypedCode({ value }),
                isAutofocus: false
              },
              Option.none()
            ),
            submitButton(h, "Verify code")
          ])
        ])
      },
      given(initial),
      expect(within(role("form", { name: "Verify" }), label("Verification code"))).toExist(),
      type(label("Verification code"), "042816"),
      expect(label("Verification code")).toHaveValue("042816"),
      submit(role("form", { name: "Verify" })),
      expect(role("status")).toHaveText("Submitted 1, resent 0, changed 0")
    )
  })

  it("needs no label, and its button submits it", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [form(h, { onSubmit: Message.SubmittedCode() }, [submitButton(h, "Continue")])])
      },
      given(initial),
      expect(role("form")).not.toHaveAttr("aria-label"),
      expect(role("button", { name: "Continue" })).toHaveAttr("type", "submit")
    )
  })
})

describe("inline", () => {
  it("puts text and a link in one line, and the link sends its message", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          inline(h, ["Need a new code?", button(h, "Send again", Message.ClickedSendAgain(), { variant: "link" })])
        ])
      },
      given(initial),
      expect(text("Need a new code?")).toExist(),
      click(role("button", { name: "Send again" })),
      expect(role("status")).toHaveText("Submitted 0, resent 1, changed 0")
    )
  })
})

describe("valueWithAction", () => {
  it("shows the value with the link that changes it", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          valueWithAction(
            h,
            "alex@mercier.example",
            button(h, "Change email", Message.ClickedChangeEmail(), { variant: "link" })
          )
        ])
      },
      given(initial),
      expect(text("alex@mercier.example")).toExist(),
      click(role("button", { name: "Change email" })),
      expect(role("status")).toHaveText("Submitted 0, resent 0, changed 1")
    )
  })
})

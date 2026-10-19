import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { change, click, expect, given, label, role, scene, submit, text, type } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button, choiceSelect, field, notice, sending, submit as submitButton, textarea, toggle } from "./control.ts"

const Message = defineMessageUnion({
  ClickedSave: {},
  ClickedRemove: {},
  SubmittedForm: {},
  TypedEmail: { value: Schema.String },
  TypedNotes: { value: Schema.String },
  ToggledNotifications: { isOn: Schema.Boolean },
  ChangedPlan: { plan: Schema.String }
})
type Message = typeof Message.Type

type Model = Readonly<{
  saves: number
  removals: number
  submissions: number
  email: string
  notes: string
  isNotificationsOn: boolean
  plan: string
}>

const initial: Model = {
  saves: 0,
  removals: 0,
  submissions: 0,
  email: "",
  notes: "",
  isNotificationsOn: false,
  plan: "free"
}

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedSave: () => ({ model: modifyFields(model, { saves: (saves) => saves + 1 }) }),
    ClickedRemove: () => ({ model: modifyFields(model, { removals: (removals) => removals + 1 }) }),
    SubmittedForm: () => ({ model: modifyFields(model, { submissions: (submissions) => submissions + 1 }) }),
    TypedEmail: ({ value }) => ({ model: modifyFields(model, { email: () => value }) }),
    TypedNotes: ({ value }) => ({ model: modifyFields(model, { notes: () => value }) }),
    ToggledNotifications: ({ isOn }) => ({ model: modifyFields(model, { isNotificationsOn: () => isOn }) }),
    ChangedPlan: ({ plan }) => ({ model: modifyFields(model, { plan: () => plan }) })
  })

const viewOf =
  (render: (model: Model, h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        h.p([h.Role("status")], [`Saved ${model.saves}, removed ${model.removals}, submitted ${model.submissions}`]),
        ...render(model, h)
      ]
    )

const emailField = (model: Model, h: HtmlBuilder<Message>, error: Option.Option<string>) =>
  field(
    h,
    {
      id: "email",
      label: "Email",
      type: "email",
      value: model.email,
      onInput: (value) => Message.TypedEmail({ value })
    },
    error
  )

const plans: ReadonlyArray<readonly [string, string]> = [
  ["free", "Free"],
  ["team", "Team"]
]

describe("button", () => {
  it("is found by its name, and clicking sends its message", () => {
    scene(
      { update, view: viewOf((_, h) => [button(h, "Save", Message.ClickedSave())]) },
      given(initial),
      expect(role("button", { name: "Save" })).toExist(),
      click(role("button", { name: "Save" })),
      click(role("button", { name: "Save" })),
      expect(role("status")).toHaveText("Saved 2, removed 0, submitted 0")
    )
  })

  it("keeps its name in every variant and size", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          button(h, "Primary", Message.ClickedSave(), { variant: "primary" }),
          button(h, "Secondary", Message.ClickedSave(), { variant: "secondary" }),
          button(h, "Quiet", Message.ClickedSave(), { variant: "quiet" }),
          button(h, "Large", Message.ClickedSave(), { size: "large" }),
          button(h, "Wide", Message.ClickedSave(), { wide: true })
        ])
      },
      given(initial),
      expect(role("button", { name: "Primary" })).toExist(),
      expect(role("button", { name: "Secondary" })).toExist(),
      expect(role("button", { name: "Quiet" })).toExist(),
      expect(role("button", { name: "Large" })).toExist(),
      click(role("button", { name: "Wide" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })

  it("says it is disabled, and cannot be clicked", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          button(h, "Remove", Message.ClickedRemove(), { variant: "quiet", isDisabled: true }),
          button(h, "Save", Message.ClickedSave())
        ])
      },
      given(initial),
      expect(role("button", { name: "Remove" })).toHaveAttr("aria-disabled", "true"),
      expect(role("button", { name: "Remove" })).toBeDisabled(),
      expect(role("button", { name: "Save" })).toBeEnabled()
    )
  })

  it("submits its form as a submit button", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          h.form([h.AriaLabel("Sign in"), h.OnSubmit(Message.SubmittedForm())], [submitButton(h, "Send a code")])
        ])
      },
      given(initial),
      expect(role("button", { name: "Send a code" })).toHaveAttr("type", "submit"),
      submit(role("form", { name: "Sign in" })),
      expect(role("status")).toHaveText("Saved 0, removed 0, submitted 1")
    )
  })
})

describe("field", () => {
  it("is found by its label, and typing sends its message", () => {
    scene(
      { update, view: viewOf((model, h) => [emailField(model, h, Option.none())]) },
      given(initial),
      expect(label("Email")).toExist(),
      type(label("Email"), "ada@example.com"),
      expect(label("Email")).toHaveValue("ada@example.com"),
      expect(role("alert")).toBeAbsent(),
      expect(label("Email")).not.toHaveAttr("aria-invalid")
    )
  })

  it("shows why its value was refused as an alert that describes it, and marks it invalid", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [emailField(model, h, Option.some("Enter a complete address."))])
      },
      given(modifyFields(initial, { email: () => "ada@" })),
      expect(role("alert")).toHaveText("Enter a complete address."),
      expect(label("Email")).toHaveAttr("aria-invalid", "true"),
      expect(label("Email")).toHaveAccessibleDescription("Enter a complete address.")
    )
  })
})

describe("textarea", () => {
  it("is found by its label, three rows tall unless given, and typing sends its message", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          textarea(h, {
            id: "notes",
            label: "Notes",
            value: model.notes,
            onInput: (value) => Message.TypedNotes({ value })
          })
        ])
      },
      given(initial),
      expect(label("Notes")).toHaveAttr("rows", "3"),
      type(label("Notes"), "Remember the milk"),
      expect(label("Notes")).toHaveValue("Remember the milk")
    )
  })

  it("is as tall as the rows it is given", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          textarea(h, {
            id: "notes",
            label: "Notes",
            value: model.notes,
            rows: 6,
            onInput: (value) => Message.TypedNotes({ value })
          })
        ])
      },
      given(initial),
      expect(label("Notes")).toHaveAttr("rows", "6")
    )
  })
})

describe("toggle", () => {
  const notifications = (model: Model, h: HtmlBuilder<Message>) => [
    toggle(h, {
      id: "notifications",
      label: "Notifications",
      isOn: model.isNotificationsOn,
      onToggle: (isOn) => Message.ToggledNotifications({ isOn })
    })
  ]

  it("is a switch found by its label, and toggling sends the state it changes to", () => {
    scene(
      { update, view: viewOf(notifications) },
      given(initial),
      expect(role("switch", { name: "Notifications" })).toHaveAttr("aria-checked", "false"),
      expect(label("Notifications")).toExist(),
      click(role("switch", { name: "Notifications" })),
      expect(role("switch", { name: "Notifications" })).toHaveAttr("aria-checked", "true"),
      click(role("switch", { name: "Notifications" })),
      expect(role("switch", { name: "Notifications" })).toHaveAttr("aria-checked", "false")
    )
  })

  it("toggles from its label's words", () => {
    scene(
      { update, view: viewOf(notifications) },
      given(initial),
      click(text("Notifications")),
      expect(role("switch", { name: "Notifications" })).toHaveAttr("aria-checked", "true")
    )
  })
})

describe("choiceSelect", () => {
  it("is found by its label, lists its choices, and changing it sends the choice", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          choiceSelect(h, {
            id: "plan",
            label: "Plan",
            choices: plans,
            value: model.plan,
            onChange: (plan) => Message.ChangedPlan({ plan })
          })
        ])
      },
      given(initial),
      expect(role("option", { name: "Team" })).toExist(),
      expect(label("Plan")).toHaveValue("free"),
      change(label("Plan"), "team"),
      expect(label("Plan")).toHaveValue("team")
    )
  })
})

describe("notice", () => {
  it("is an alert holding the message, in each tone", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          notice(h, Option.some("That code is not right.")),
          notice(h, Option.some("Setup is not finished."), { tone: "caution" }),
          notice(h, Option.some("Saved."), { tone: "success" })
        ])
      },
      given(initial),
      expect(role("alert", { name: "That code is not right." })).toHaveText("That code is not right."),
      expect(role("alert", { name: "Setup is not finished." })).toExist(),
      expect(role("alert", { name: "Saved." })).toExist()
    )
  })

  it("renders nothing when there is no message", () => {
    scene(
      { update, view: viewOf((_, h) => [notice(h, Option.none()), notice(h, Option.none(), { tone: "success" })]) },
      given(initial),
      expect(role("alert")).toBeAbsent()
    )
  })
})

describe("sending", () => {
  it("says the action is on its way, while it is", () => {
    scene(
      { update, view: viewOf((_, h) => [h.p([], ["Rename workspace", sending(h, true)])]) },
      given(initial),
      expect(text("Sending…", { exact: false })).toExist()
    )
  })

  it("renders nothing once it is not", () => {
    scene(
      { update, view: viewOf((_, h) => [h.p([], ["Rename workspace", sending(h, false)])]) },
      given(initial),
      expect(text("Sending…", { exact: false })).toBeAbsent()
    )
  })
})

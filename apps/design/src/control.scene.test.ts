import { describe, it } from "@effect/vitest"
import * as RadioGroup from "@foldkit/ui/radioGroup"
import { Option, Schema } from "effect"
import { type Update, makeApplicationDefinition } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  Command,
  all,
  change,
  click,
  expect,
  expectAll,
  expectHandled,
  expectIgnored,
  given,
  keydown,
  label,
  nth,
  role,
  scene,
  selector,
  submit,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  announcement,
  answerKeys,
  button,
  buttonClass,
  buttonContent,
  buttonRow,
  type Choice,
  choiceGroup,
  choiceSelect,
  codeInput,
  column,
  field,
  fieldGrid,
  hint,
  iconButton,
  iconSubmit,
  lineButton,
  link,
  linkButton,
  loadingLine,
  notice,
  noticeBox,
  searchField,
  sending,
  submit as submitButton,
  textarea,
  toggle
} from "./control.ts"

const Message = defineMessageUnion({
  ClickedSave: {},
  ClickedRemove: {},
  SubmittedForm: {},
  TypedEmail: { value: Schema.String },
  TypedNotes: { value: Schema.String },
  TypedCode: { value: Schema.String },
  CompletedCode: { value: Schema.String },
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
  code: string
  completions: number
  isNotificationsOn: boolean
  plan: string
}>

const initial: Model = {
  saves: 0,
  removals: 0,
  submissions: 0,
  email: "",
  notes: "",
  code: "",
  completions: 0,
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
    TypedCode: ({ value }) => ({ model: modifyFields(model, { code: () => value }) }),
    CompletedCode: ({ value }) => ({
      model: modifyFields(model, { code: () => value, completions: (completions) => completions + 1 })
    }),
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
          button(h, "Link", Message.ClickedSave(), { variant: "link" }),
          button(h, "Large", Message.ClickedSave(), { size: "large" }),
          button(h, "Wide", Message.ClickedSave(), { wide: true })
        ])
      },
      given(initial),
      expect(role("button", { name: "Primary" })).toExist(),
      expect(role("button", { name: "Secondary" })).toExist(),
      expect(role("button", { name: "Quiet" })).toExist(),
      expect(role("button", { name: "Link" })).toExist(),
      expect(role("button", { name: "Large" })).toExist(),
      click(role("button", { name: "Wide" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })

  it("is found by the name it is given when its label alone does not tell it from the buttons around it", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          button(h, "Revoke", Message.ClickedSave(), {
            variant: "quiet",
            name: "Revoke invitation for casey@example.com"
          }),
          button(h, "Revoke", Message.ClickedRemove(), {
            variant: "quiet",
            name: "Revoke invitation for dana@example.com"
          })
        ])
      },
      given(initial),
      expect(role("button", { name: "Revoke" })).toBeAbsent(),
      click(role("button", { name: "Revoke invitation for dana@example.com" })),
      expect(role("status")).toHaveText("Saved 0, removed 1, submitted 0"),
      click(role("button", { name: "Revoke invitation for casey@example.com" })),
      expect(role("status")).toHaveText("Saved 1, removed 1, submitted 0")
    )
  })

  it("says whether what it shows is shown, as aria-expanded, only when it is given", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          button(h, "View log", Message.ClickedSave(), { variant: "quiet", isExpanded: false }),
          button(h, "Hide log", Message.ClickedSave(), { variant: "quiet", isExpanded: true }),
          button(h, "Save", Message.ClickedSave())
        ])
      },
      given(initial),
      expect(role("button", { name: "View log" })).toHaveAttr("aria-expanded", "false"),
      expect(role("button", { name: "Hide log" })).toHaveAttr("aria-expanded", "true"),
      expect(role("button", { name: "Save" })).not.toHaveAttr("aria-expanded"),
      expect(role("button", { name: "Hide log" })).toHaveClass("aria-expanded:bg-subtle")
    )
  })

  it("is found by its name and unavailable while it is disabled, as a Stop that is stopping is", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          button(h, "Stop", Message.ClickedSave(), { name: "Stopping", isDisabled: true }),
          button(h, "Stop", Message.ClickedRemove(), { name: "Stop Atlas" })
        ])
      },
      given(initial),
      expect(role("button", { name: "Stopping" })).toHaveAttr("aria-disabled", "true"),
      expect(role("button", { name: "Stopping" })).toBeDisabled(),
      expect(role("status")).toHaveText("Saved 0, removed 0, submitted 0"),
      click(role("button", { name: "Stop Atlas" })),
      expect(role("status")).toHaveText("Saved 0, removed 1, submitted 0")
    )
  })

  it("is a link inside a sentence, found by its name, and clicking sends its message", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          h.p([], ["Need a new code? ", button(h, "Send again", Message.ClickedSave(), { variant: "link" })])
        ])
      },
      given(initial),
      click(role("button", { name: "Send again" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })

  it("draws an icon before its label, which names the button, and hides the icon", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          button(h, "Create workspace", Message.ClickedSave(), { icon: "mark-new" }),
          button(h, "Save", Message.ClickedSave()),
          h.form(
            [h.AriaLabel("Sign in"), h.OnSubmit(Message.SubmittedForm())],
            [submitButton(h, "Send a code", { icon: "mark-send" })]
          )
        ])
      },
      given(initial),
      expect(role("button", { name: "Create workspace" })).toHaveText("Create workspace"),
      expect(within(role("button", { name: "Create workspace" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Create workspace" }), selector("svg"))).toHaveAttr("width", "1rem"),
      expect(within(role("button", { name: "Create workspace" }), selector("path"))).toHaveAttr(
        "d",
        "M12 4L12 20M4 12L20 12"
      ),
      expect(within(role("button", { name: "Save" }), selector("svg"))).toBeAbsent(),
      expect(within(role("button", { name: "Send a code" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      click(role("button", { name: "Create workspace" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0"),
      submit(role("form", { name: "Sign in" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 1")
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

  it("shows an example of what to enter while it is empty", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          field(
            h,
            {
              id: "email",
              label: "Email",
              type: "email",
              value: model.email,
              placeholder: "you@example.com",
              onInput: (value) => Message.TypedEmail({ value })
            },
            Option.none()
          )
        ])
      },
      given(initial),
      expect(label("Email")).toHaveAttr("placeholder", "you@example.com"),
      type(label("Email"), "ada@example.com"),
      expect(label("Email")).toHaveValue("ada@example.com")
    )
  })

  it("shows a hint under the input that describes it, and the refusal describes it first when there is one", () => {
    const hinted = (error: Option.Option<string>) => (model: Model, h: HtmlBuilder<Message>) =>
      field(
        h,
        {
          id: "email",
          label: "Email",
          type: "email",
          value: model.email,
          hint: "Use the address you signed up with.",
          onInput: (value) => Message.TypedEmail({ value })
        },
        error
      )
    scene(
      { update, view: viewOf((model, h) => [hinted(Option.none())(model, h)]) },
      given(initial),
      expect(text("Use the address you signed up with.")).toExist(),
      expect(label("Email")).toHaveAccessibleDescription("Use the address you signed up with."),
      expect(label("Email")).not.toHaveAttr("aria-invalid"),
      expect(role("alert")).toBeAbsent()
    )
    scene(
      { update, view: viewOf((model, h) => [hinted(Option.some("Enter a complete address."))(model, h)]) },
      given(modifyFields(initial, { email: () => "ada@" })),
      expect(role("alert")).toHaveText("Enter a complete address."),
      expect(text("Use the address you signed up with.")).toExist(),
      expect(label("Email")).toHaveAccessibleDescription("Enter a complete address."),
      expect(label("Email")).toHaveAttr("aria-invalid", "true")
    )
  })

  it("shows its label above the input, unless the label is hidden, which still names the input", () => {
    scene(
      { update, view: viewOf((model, h) => [emailField(model, h, Option.none())]) },
      given(initial),
      expect(selector("label.sr-only")).toBeAbsent(),
      expect(label("Email")).toExist()
    )
    scene(
      {
        update,
        view: viewOf((model, h) => [
          field(
            h,
            {
              id: "email",
              label: "Email",
              type: "email",
              value: model.email,
              isLabelHidden: true,
              onInput: (value) => Message.TypedEmail({ value })
            },
            Option.none()
          )
        ])
      },
      given(initial),
      expect(selector("label.sr-only")).toHaveText("Email"),
      expect(role("textbox", { name: "Email" })).toExist(),
      type(label("Email"), "ada@example.com"),
      expect(label("Email")).toHaveValue("ada@example.com")
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

  it("shows its value and takes none while it is disabled", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          field(
            h,
            {
              id: "email",
              label: "Email",
              type: "email",
              value: model.email,
              isDisabled: true,
              onInput: (value) => Message.TypedEmail({ value })
            },
            Option.none()
          )
        ])
      },
      given(modifyFields(initial, { email: () => "ada@example.com" })),
      expect(label("Email")).toBeDisabled(),
      expect(label("Email")).toHaveValue("ada@example.com")
    )
  })
})

describe("answerKeys", () => {
  const Finding = defineMessageUnion({ TypedFind: { value: Schema.String }, PressedKey: { key: Schema.String } })
  type Finding = typeof Finding.Type

  const findUpdate = (pressed: ReadonlyArray<string>, message: Finding) =>
    Finding.match<Update.Return<ReadonlyArray<string>, Finding>>(message, {
      TypedFind: () => ({ model: pressed }),
      PressedKey: ({ key }) => ({ model: [...pressed, key] })
    })

  const answered = (key: string) =>
    key === "ArrowDown" || key === "Enter" ? Option.some(Finding.PressedKey({ key })) : Option.none()

  const findView = (pressed: ReadonlyArray<string>, h: HtmlBuilder<Finding>) =>
    h.div(
      [],
      [
        h.p([h.Role("status")], [`Pressed ${pressed.join(" ")}`]),
        field(
          h,
          {
            id: "find",
            label: "Find",
            type: "search",
            value: "",
            onInput: (value) => Finding.TypedFind({ value }),
            isAutofocus: false,
            attributes: [answerKeys(h, answered)]
          },
          Option.none()
        )
      ]
    )

  it("keeps the keys it answers from the field, and leaves the others and those with a modifier to it", () => {
    scene(
      { update: findUpdate, view: findView },
      given([]),
      keydown(label("Find"), "ArrowDown"),
      expectHandled(),
      expect(role("status")).toHaveText("Pressed ArrowDown"),
      keydown(label("Find"), "a"),
      expectIgnored(),
      keydown(label("Find"), "Enter", { shiftKey: true }),
      expectIgnored(),
      keydown(label("Find"), "Enter", { metaKey: true }),
      expectIgnored(),
      keydown(label("Find"), "Enter"),
      expectHandled(),
      expect(role("status")).toHaveText("Pressed ArrowDown Enter")
    )
  })

  it("is on a field only when the field is given it", () => {
    scene(
      { update, view: viewOf((model, h) => [emailField(model, h, Option.none())]) },
      given(initial),
      expect(label("Email")).not.toHaveHandler("keydown")
    )
    scene({ update: findUpdate, view: findView }, given([]), expect(label("Find")).toHaveHandler("keydown"))
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

  it("shows a hint under the box that describes it, and the refusal describes it first when there is one", () => {
    const hinted = (error: Option.Option<string>) => (model: Model, h: HtmlBuilder<Message>) =>
      textarea(h, {
        id: "notes",
        label: "Notes",
        value: model.notes,
        hint: "What to remember.",
        error,
        onInput: (value) => Message.TypedNotes({ value })
      })
    scene(
      { update, view: viewOf((model, h) => [hinted(Option.none())(model, h)]) },
      given(initial),
      expect(text("What to remember.")).toExist(),
      expect(label("Notes")).toHaveAccessibleDescription("What to remember."),
      expect(label("Notes")).not.toHaveAttr("aria-invalid"),
      expect(role("alert")).toBeAbsent()
    )
    scene(
      { update, view: viewOf((model, h) => [hinted(Option.some("That is too long."))(model, h)]) },
      given(initial),
      expect(role("alert")).toHaveText("That is too long."),
      expect(text("What to remember.")).toExist(),
      expect(label("Notes")).toHaveAccessibleDescription("That is too long."),
      expect(label("Notes")).toHaveAttr("aria-invalid", "true")
    )
  })

  it("shows its value and takes none while it is disabled", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          textarea(h, {
            id: "notes",
            label: "Notes",
            value: model.notes,
            isDisabled: true,
            onInput: (value) => Message.TypedNotes({ value })
          })
        ])
      },
      given(modifyFields(initial, { notes: () => "Remember the milk" })),
      expect(label("Notes")).toBeDisabled(),
      expect(label("Notes")).toHaveValue("Remember the milk")
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

  it("shows how it is set and cannot be clicked while it is disabled", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          toggle(h, {
            id: "notifications",
            label: "Notifications",
            isOn: model.isNotificationsOn,
            isDisabled: true,
            onToggle: (isOn) => Message.ToggledNotifications({ isOn })
          })
        ])
      },
      given(modifyFields(initial, { isNotificationsOn: () => true })),
      expect(role("switch", { name: "Notifications" })).toHaveAttr("aria-checked", "true"),
      expect(role("switch", { name: "Notifications" })).toHaveAttr("aria-disabled", "true"),
      expect(role("switch", { name: "Notifications" })).toBeDisabled(),
      expect(text("Notifications")).toHaveClass("text-ink-disabled")
    )
  })

  it("is not disabled unless it is told", () => {
    scene(
      { update, view: viewOf(notifications) },
      given(initial),
      expect(role("switch", { name: "Notifications" })).not.toHaveAttr("aria-disabled"),
      expect(text("Notifications")).toHaveClass("text-ink")
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

  it("is still found by its label when the label is hidden, and changing it sends the choice", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          h.p([], ["Ada"]),
          choiceSelect(
            h,
            {
              id: "plan",
              label: "Plan of Ada",
              choices: plans,
              value: model.plan,
              onChange: (plan) => Message.ChangedPlan({ plan })
            },
            { isLabelHidden: true }
          )
        ])
      },
      given(initial),
      expect(label("Plan of Ada")).toHaveValue("free"),
      expect(role("option", { name: "Team" })).toExist(),
      change(label("Plan of Ada"), "team"),
      expect(label("Plan of Ada")).toHaveValue("team")
    )
  })

  it("reads a choice's description after its label, and lists a choice that can't be chosen as disabled", () => {
    const harnesses: ReadonlyArray<Choice<string>> = [
      ["", "Auto", { description: "amends chooses a harness as the agent works" }],
      ["opencode", "opencode", { description: "opencode · Works only in a sandbox" }],
      ["vertex", "Vertex", { description: "Its integration isn't installed on this host.", isDisabled: true }],
      ["plain", "Plain"]
    ]
    scene(
      {
        update,
        view: viewOf((model, h) => [
          choiceSelect(h, {
            id: "harness",
            label: "Harness",
            choices: harnesses,
            value: model.plan,
            onChange: (plan) => Message.ChangedPlan({ plan })
          })
        ])
      },
      given(modifyFields(initial, { plan: () => "" })),
      expect(role("option", { name: "Auto · amends chooses a harness as the agent works" })).toExist(),
      expect(role("option", { name: "opencode · opencode · Works only in a sandbox" })).toBeEnabled(),
      expect(role("option", { name: "Vertex · Its integration isn't installed on this host." })).toBeDisabled(),
      expect(role("option", { name: "Plain" })).toBeEnabled(),
      change(label("Harness"), "opencode"),
      expect(label("Harness")).toHaveValue("opencode")
    )
  })

  it("shows a hint under the select that describes it, and why its value was refused first when there is one", () => {
    const hinted = (error: Option.Option<string>) => (model: Model, h: HtmlBuilder<Message>) =>
      choiceSelect(h, {
        id: "plan",
        label: "Plan",
        choices: plans,
        value: model.plan,
        hint: "What you pay for.",
        error,
        onChange: (plan) => Message.ChangedPlan({ plan })
      })
    scene(
      { update, view: viewOf((model, h) => [hinted(Option.none())(model, h)]) },
      given(initial),
      expect(text("What you pay for.")).toExist(),
      expect(label("Plan")).toHaveAccessibleDescription("What you pay for."),
      expect(label("Plan")).not.toHaveAttr("aria-invalid"),
      expect(role("alert")).toBeAbsent()
    )
    scene(
      { update, view: viewOf((model, h) => [hinted(Option.some("Choose a plan you can pay for."))(model, h)]) },
      given(initial),
      expect(role("alert")).toHaveText("Choose a plan you can pay for."),
      expect(text("What you pay for.")).toExist(),
      expect(label("Plan")).toHaveAccessibleDescription("Choose a plan you can pay for."),
      expect(label("Plan")).toHaveAttr("aria-invalid", "true")
    )
  })

  it("shows its choice and takes no other while it is disabled", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          choiceSelect(h, {
            id: "plan",
            label: "Plan",
            choices: plans,
            value: model.plan,
            isDisabled: true,
            onChange: (plan) => Message.ChangedPlan({ plan })
          })
        ])
      },
      given(initial),
      expect(label("Plan")).toBeDisabled(),
      expect(label("Plan")).toHaveValue("free")
    )
  })
})

describe("fieldGrid", () => {
  it("holds its fields, each one found by its label and working", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          fieldGrid(h, [
            choiceSelect(h, {
              id: "plan",
              label: "Plan",
              choices: plans,
              value: model.plan,
              onChange: (plan) => Message.ChangedPlan({ plan })
            }),
            emailField(model, h, Option.none())
          ])
        ])
      },
      given(initial),
      expect(label("Plan")).toHaveValue("free"),
      expect(label("Email")).toExist(),
      change(label("Plan"), "team"),
      type(label("Email"), "ada@example.com"),
      expect(label("Plan")).toHaveValue("team"),
      expect(label("Email")).toHaveValue("ada@example.com")
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

describe("noticeBox", () => {
  it("is a note named by its title, with a line for each reason under it, and not an alert", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          noticeBox(h, {
            title: "This agent can't run as it is set up",
            lines: ["Its model connection was removed.", "Its harness works only in a sandbox, and it has none."]
          })
        ])
      },
      given(initial),
      expect(role("note", { name: "This agent can't run as it is set up" })).toExist(),
      expect(
        within(
          role("note", { name: "This agent can't run as it is set up" }),
          text("This agent can't run as it is set up")
        )
      ).toExist(),
      expect(role("listitem", { name: "Its model connection was removed." })).toExist(),
      expect(role("listitem", { name: "Its harness works only in a sandbox, and it has none." })).toExist(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("is boxed in the tone's colors with the tone's shape, caution unless it is danger", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          noticeBox(h, { title: "Needs setup", lines: [] }),
          noticeBox(h, { title: "Unavailable", lines: [], tone: "danger" })
        ])
      },
      given(initial),
      expect(role("note", { name: "Needs setup" })).toHaveClass("bg-caution-surface"),
      expect(role("note", { name: "Needs setup" })).toHaveClass("border-caution-border"),
      expect(within(role("note", { name: "Needs setup" }), selector("span.bg-caution-mark"))).toExist(),
      expect(role("note", { name: "Unavailable" })).toHaveClass("bg-danger-surface"),
      expect(within(role("note", { name: "Unavailable" }), selector("span.bg-danger-mark"))).toExist(),
      expect(within(role("note", { name: "Unavailable" }), selector("ul"))).toBeAbsent()
    )
  })

  it("is green with a filled square when it says what was found to be well", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          noticeBox(h, { title: "Working", lines: ["The check found nothing wrong."], tone: "success" })
        ])
      },
      given(initial),
      expect(role("note", { name: "Working" })).toHaveClass("bg-success-surface"),
      expect(role("note", { name: "Working" })).toHaveClass("border-success-border"),
      expect(within(role("note", { name: "Working" }), selector("span.bg-success-mark"))).toExist(),
      expect(within(role("note", { name: "Working" }), text("Working"))).toHaveClass("text-success-text"),
      expect(role("listitem", { name: "The check found nothing wrong." })).toExist(),
      expect(role("alert")).toBeAbsent()
    )
  })
})

describe("link", () => {
  it("is a link found by its name, to a page elsewhere that opens in a new tab and tells it nothing", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          h.p([], ["Anthropic · ", link(h, { label: "Documentation", href: "https://docs.anthropic.com" })])
        ])
      },
      given(initial),
      expect(role("link", { name: "Documentation" })).toHaveAttr("href", "https://docs.anthropic.com"),
      expect(role("link", { name: "Documentation" })).toHaveAttr("target", "_blank"),
      expect(role("link", { name: "Documentation" })).toHaveAttr("rel", "noreferrer"),
      expect(role("link", { name: "Documentation" })).toHaveClass("underline")
    )
  })
})

describe("linkButton", () => {
  it("is a link found by its name, to the address it is given, in the look of a button, and opens in the same tab", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          linkButton(h, { label: "Reload", href: "" }, { variant: "primary" }),
          linkButton(h, { label: "Documentation", href: "/docs" })
        ])
      },
      given(initial),
      expect(role("link", { name: "Reload" })).toHaveAttr("href", ""),
      expect(role("link", { name: "Reload" })).toHaveClass("bg-action"),
      expect(role("link", { name: "Reload" })).toHaveClass("text-on-action"),
      expect(role("link", { name: "Reload" })).toHaveClass("min-h-9"),
      expect(role("link", { name: "Reload" })).toHaveClass("focus-ring"),
      expect(role("link", { name: "Reload" })).not.toHaveAttr("target"),
      expect(role("link", { name: "Documentation" })).toHaveAttr("href", "/docs"),
      expect(role("link", { name: "Documentation" })).toHaveClass("border-outline"),
      expect(role("button")).toBeAbsent()
    )
  })

  it("takes the size and the icon of a button", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          linkButton(h, { label: "Reload", href: "" }, { variant: "primary", size: "large" }),
          linkButton(h, { label: "New task", href: "/tasks/new" }, { icon: "mark-new" })
        ])
      },
      given(initial),
      expect(role("link", { name: "Reload" })).toHaveClass("min-h-11"),
      expect(role("link", { name: "Reload" })).toHaveClass("text-item"),
      expect(role("link", { name: "New task" })).toHaveClass("gap-2"),
      expect(within(role("link", { name: "New task" }), selector("svg"))).toHaveAttr("aria-hidden", "true")
    )
  })
})

describe("lineButton", () => {
  it("is a button found by its name that sends its message and reads as part of the line around it", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          h.p([], ["The model was unavailable. ", lineButton(h, "Agent settings", Message.ClickedSave())])
        ])
      },
      given(initial),
      expect(role("button", { name: "Agent settings" })).toHaveText("Agent settings"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("inline"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("p-0"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("border-0"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("bg-transparent"),
      click(role("button", { name: "Agent settings" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })

  it("is quiet and medium at control size, and darkens and is underlined while it is hovered", () => {
    scene(
      { update, view: viewOf((_, h) => [lineButton(h, "Agent settings", Message.ClickedSave())]) },
      given(initial),
      expect(role("button", { name: "Agent settings" })).toHaveClass("text-control"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("font-medium"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("text-ink-secondary"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("hover:text-ink"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("hover:underline"),
      expect(role("button", { name: "Agent settings" })).toHaveClass("focus-ring"),
      expect(role("button", { name: "Agent settings" })).not.toHaveClass("underline")
    )
  })
})

describe("hint", () => {
  it("is a line of text beside the control it is about", () => {
    scene(
      { update, view: viewOf((_, h) => [hint(h, "Use your most recent code.")]) },
      given(initial),
      expect(text("Use your most recent code.")).toExist()
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

describe("iconSubmit", () => {
  it("is a submit button named by its label, with an icon that assistive technology does not read", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          h.form(
            [h.AriaLabel("Reply"), h.OnSubmit(Message.SubmittedForm())],
            [iconSubmit(h, { icon: "mark-send", label: "Send" })]
          )
        ])
      },
      given(initial),
      expect(role("button", { name: "Send" })).toHaveAttr("type", "submit"),
      expect(within(role("button", { name: "Send" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      click(role("button", { name: "Send" })),
      expect(role("status")).toHaveText("Saved 0, removed 0, submitted 1")
    )
  })

  it("is aria-disabled when disabled, and not otherwise", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          h.form(
            [h.AriaLabel("Reply"), h.OnSubmit(Message.SubmittedForm())],
            [iconSubmit(h, { icon: "mark-send", label: "Send" }, { isDisabled: true })]
          )
        ])
      },
      given(initial),
      expect(role("button", { name: "Send" })).toHaveAttr("aria-disabled", "true")
    )
  })
})

describe("buttonRow", () => {
  it("holds its controls, each one working", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          buttonRow(h, [
            button(h, "Follow", Message.ClickedSave(), { variant: "quiet" }),
            button(h, "Rename", Message.ClickedRemove(), { variant: "quiet" })
          ])
        ])
      },
      given(initial),
      click(role("button", { name: "Follow" })),
      click(role("button", { name: "Rename" })),
      click(role("button", { name: "Rename" })),
      expect(role("status")).toHaveText("Saved 1, removed 2, submitted 0")
    )
  })

  it("keeps its controls at the start of its width, and centers them when asked", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [buttonRow(h, [button(h, "Show older", Message.ClickedSave(), { variant: "quiet" })])])
      },
      given(initial),
      expect(selector(".flex-wrap")).toExist(),
      expect(selector(".flex-wrap.justify-center")).toBeAbsent()
    )
    scene(
      {
        update,
        view: viewOf((_, h) => [
          buttonRow(h, [button(h, "Show older", Message.ClickedSave(), { variant: "quiet" })], { isCentered: true })
        ])
      },
      given(initial),
      expect(within(selector(".flex-wrap.justify-center"), role("button", { name: "Show older" }))).toExist(),
      click(role("button", { name: "Show older" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })
})

describe("column", () => {
  it("holds a notice over a button, a few pieces 12px apart, each one working", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          column(h, [
            notice(h, Option.some("The host could not be reached. Try again.")),
            buttonRow(h, [button(h, "Try again", Message.ClickedSave(), { variant: "quiet" })])
          ])
        ])
      },
      given(initial),
      expect(selector(".flex-col.gap-3")).toExist(),
      expect(within(selector(".flex-col.gap-3"), role("alert"))).toHaveText(
        "The host could not be reached. Try again."
      ),
      click(within(selector(".flex-col.gap-3"), role("button", { name: "Try again" }))),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })
})

describe("iconButton", () => {
  it("is a button named by its label, and clicking it sends its message", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          iconButton(h, { icon: "mark-new", label: "Create group", onClick: Message.ClickedSave() })
        ])
      },
      given(initial),
      click(role("button", { name: "Create group" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })

  it("holds an icon that assistive technology does not read, at either size", () => {
    for (const options of [{}, { size: "compact" }] as const) {
      scene(
        {
          update,
          view: viewOf((_, h) => [
            iconButton(h, { icon: "mark-search", label: "Search groups", onClick: Message.ClickedSave() }, options)
          ])
        },
        given(initial),
        expect(within(role("button", { name: "Search groups" }), selector("svg"))).toHaveAttr("aria-hidden", "true")
      )
    }
  })

  it("says whether it is pressed, as a switch does, and says nothing when it is not given", () => {
    const isOdd = (saves: number) => saves % 2 === 1

    scene(
      {
        update,
        view: viewOf((model, h) => [
          iconButton(
            h,
            {
              icon: isOdd(model.saves) ? "bell-filled" : "bell",
              label: "Notifications",
              onClick: Message.ClickedSave()
            },
            { isPressed: isOdd(model.saves) }
          )
        ])
      },
      given(initial),
      expect(role("button", { name: "Notifications" })).toHaveAttr("aria-pressed", "false"),
      click(role("button", { name: "Notifications" })),
      expect(role("button", { name: "Notifications" })).toHaveAttr("aria-pressed", "true"),
      click(role("button", { name: "Notifications" })),
      expect(role("button", { name: "Notifications" })).toHaveAttr("aria-pressed", "false")
    )
    scene(
      {
        update,
        view: viewOf((_, h) => [
          iconButton(h, { icon: "bell", label: "Notifications", onClick: Message.ClickedSave() })
        ])
      },
      given(initial),
      expect(role("button", { name: "Notifications" })).toExist(),
      expect(selector("[aria-pressed]")).toBeAbsent()
    )
  })

  it("says it is disabled and cannot be clicked, staying a switch when it is pressed", () => {
    scene(
      {
        update,
        view: viewOf((_, h) => [
          iconButton(
            h,
            { icon: "bell-filled", label: "Following", onClick: Message.ClickedSave() },
            { isPressed: true, isDisabled: true }
          ),
          iconButton(h, { icon: "bell", label: "Follow", onClick: Message.ClickedSave() }, { isDisabled: false })
        ])
      },
      given(initial),
      expect(role("button", { name: "Following" })).toHaveAttr("aria-disabled", "true"),
      expect(role("button", { name: "Following" })).toBeDisabled(),
      expect(role("button", { name: "Following" })).toHaveAttr("aria-pressed", "true"),
      expect(role("button", { name: "Follow" })).not.toHaveAttr("aria-disabled"),
      expect(role("button", { name: "Follow" })).toBeEnabled(),
      click(role("button", { name: "Follow" })),
      expect(role("status")).toHaveText("Saved 1, removed 0, submitted 0")
    )
  })
})

describe("codeInput", () => {
  type CodeFieldOptions = Readonly<{
    isComplete?: boolean
    error?: string
    hint?: string
    isDisabled?: boolean
    isAutofocus?: boolean
  }>

  const codeField = (model: Model, h: HtmlBuilder<Message>, options: CodeFieldOptions = {}): Html =>
    codeInput(
      h,
      {
        id: "code",
        label: "Verification code",
        value: model.code,
        onInput: (value) => Message.TypedCode({ value }),
        ...(options.isComplete === true ? { onComplete: (value: string) => Message.CompletedCode({ value }) } : {}),
        ...(options.hint === undefined ? {} : { hint: options.hint }),
        ...(options.isDisabled === true ? { isDisabled: true } : {}),
        isAutofocus: options.isAutofocus ?? false
      },
      options.error === undefined ? Option.none() : Option.some(options.error)
    )

  const codeView = (options: CodeFieldOptions = {}) =>
    viewOf((model, h) => [codeField(model, h, options), h.p([h.Role("note")], [`${model.completions} completed`])])

  const cells = all.selector('span[aria-hidden="true"]')

  it("is one native input found by its label, for a numeric one-time code", () => {
    scene(
      { update, view: codeView() },
      given(initial),
      expect(label("Verification code")).toHaveAttr("type", "text"),
      expect(label("Verification code")).toHaveAttr("inputmode", "numeric"),
      expect(label("Verification code")).toHaveAttr("autocomplete", "one-time-code"),
      expect(label("Verification code")).toHaveAttr("id", "code"),
      expect(label("Verification code")).not.toHaveAttr("aria-invalid"),
      expectAll(all.selector("input")).toHaveCount(1)
    )
  })

  it("is focused as it shows unless it says otherwise", () => {
    scene({ update, view: codeView() }, given(initial), expect(label("Verification code")).not.toHaveAttr("autofocus"))
    scene(
      { update, view: codeView({ isAutofocus: true }) },
      given(initial),
      expect(label("Verification code")).toHaveAttr("autofocus")
    )
  })

  it("draws six cells, hidden from assistive technology, that show the digits typed", () => {
    scene(
      { update, view: codeView() },
      given(initial),
      expectAll(cells).toHaveCount(6),
      type(label("Verification code"), "482"),
      expect(label("Verification code")).toHaveValue("482"),
      expect(nth(cells, 0)).toHaveText("4"),
      expect(nth(cells, 1)).toHaveText("8"),
      expect(nth(cells, 2)).toHaveText("2"),
      expect(nth(cells, 3)).toHaveText(""),
      expect(nth(cells, 5)).toHaveText("")
    )
  })

  it("keeps digits only, whatever is typed or pasted", () => {
    scene(
      { update, view: codeView() },
      given(initial),
      type(label("Verification code"), "4a8 2-"),
      expect(label("Verification code")).toHaveValue("482"),
      expect(nth(cells, 2)).toHaveText("2"),
      expect(nth(cells, 3)).toHaveText("")
    )
  })

  it("keeps at most six digits", () => {
    scene(
      { update, view: codeView() },
      given(initial),
      type(label("Verification code"), "48 29 16 77"),
      expect(label("Verification code")).toHaveValue("482916")
    )
  })

  it("sends onComplete with the code in place of onInput when the sixth digit is in", () => {
    scene(
      { update, view: codeView({ isComplete: true }) },
      given(initial),
      type(label("Verification code"), "48291"),
      expect(label("Verification code")).toHaveValue("48291"),
      expect(role("note")).toHaveText("0 completed"),
      type(label("Verification code"), "482 916"),
      expect(label("Verification code")).toHaveValue("482916"),
      expect(role("note")).toHaveText("1 completed")
    )
  })

  it("sends onInput for the sixth digit when it has no onComplete", () => {
    scene(
      { update, view: codeView() },
      given(initial),
      type(label("Verification code"), "482916"),
      expect(label("Verification code")).toHaveValue("482916"),
      expect(role("note")).toHaveText("0 completed")
    )
  })

  it("outlines the cell the next digit goes into, the last one when all six are in", () => {
    scene(
      { update, view: codeView() },
      given(initial),
      expectAll(all.selector("span[data-next]")).toHaveCount(1),
      expect(nth(cells, 0)).toHaveAttr("data-next"),
      type(label("Verification code"), "482"),
      expect(nth(cells, 3)).toHaveAttr("data-next"),
      expect(nth(cells, 0)).not.toHaveAttr("data-next"),
      type(label("Verification code"), "482916"),
      expectAll(all.selector("span[data-next]")).toHaveCount(1),
      expect(nth(cells, 5)).toHaveAttr("data-next")
    )
  })

  it("outlines every cell in danger and describes the input with the reason it was refused", () => {
    scene(
      { update, view: codeView({ error: "That code doesn't match. Check it and try again." }) },
      given(initial),
      expect(selector("[data-invalid]")).toExist(),
      expect(label("Verification code")).toHaveAttr("aria-invalid", "true"),
      expect(label("Verification code")).toHaveAttr("aria-describedby", "code-description"),
      expect(role("alert")).toHaveText("That code doesn't match. Check it and try again.")
    )
    scene(
      { update, view: codeView() },
      given(initial),
      expect(selector("[data-invalid]")).toBeAbsent(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("shows a hint under the cells, which describes the input", () => {
    scene(
      { update, view: codeView({ hint: "Use your most recent code." }) },
      given(initial),
      expect(text("Use your most recent code.")).toExist(),
      expect(label("Verification code")).toHaveAttr("aria-describedby", "code-description"),
      expect(within(selector("#code-description"), text("Use your most recent code."))).toExist()
    )
  })

  it("shows its digits and takes none while it is disabled", () => {
    scene(
      { update, view: codeView({ isDisabled: true }) },
      given({ ...initial, code: "482916" }),
      expect(label("Verification code")).toBeDisabled(),
      expect(selector("[data-disabled]")).toExist(),
      expect(nth(cells, 0)).toHaveText("4"),
      expect(nth(cells, 5)).toHaveText("6")
    )
  })
})

describe("loadingLine", () => {
  it("says what is waited for, in a live region", () => {
    scene(
      { update, view: (_: Model, h: HtmlBuilder<Message>) => h.div([], [loadingLine(h, "Loading your inbox…")]) },
      given(initial),
      expect(role("status")).toHaveText("Loading your inbox…"),
      expect(selector('p[role="status"]')).toExist()
    )
  })
})

describe("announcement", () => {
  const announcing = (words: Option.Option<string>) => (_: Model, h: HtmlBuilder<Message>) =>
    h.div([], [announcement(h, words)])

  it("says what happened, in a live region", () => {
    scene(
      { update, view: announcing(Option.some("We sent a new code. Use the latest one.")) },
      given(initial),
      expect(role("status")).toHaveText("We sent a new code. Use the latest one."),
      expect(selector('p[role="status"]')).toExist(),
      expect(role("status")).not.toHaveClass("hidden")
    )
  })

  it("is in place before it has anything to say, empty and taking back a gap of the column it lies in", () => {
    scene(
      { update, view: announcing(Option.none()) },
      given(initial),
      expect(role("status")).toExist(),
      expect(role("status")).toHaveText(""),
      expect(role("status")).toHaveClass("empty:-mb-4")
    )
  })
})

describe("searchField", () => {
  const searchView = viewOf((model, h) => [
    searchField(h, {
      id: "search",
      label: "Search tasks",
      placeholder: "Search tasks…",
      value: model.notes,
      onInput: (value) => Message.TypedNotes({ value })
    })
  ])

  it("is found by its hidden label, shows its placeholder, and takes what is typed", () => {
    scene(
      { update, view: searchView },
      given(initial),
      expect(label("Search tasks")).toHaveAttr("type", "search"),
      expect(label("Search tasks")).toHaveAttr("placeholder", "Search tasks…"),
      expect(text("Search tasks")).toHaveClass("sr-only"),
      type(label("Search tasks"), "ship"),
      expect(label("Search tasks")).toHaveValue("ship")
    )
  })

  it("draws a magnifier that assistive technology does not read, and takes no focus as it shows", () => {
    scene(
      { update, view: searchView },
      given(initial),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true"),
      expect(label("Search tasks")).not.toHaveAttr("autofocus")
    )
  })

  it("is a filled box 36px tall that gives way before it wraps, and a line of its own on a phone", () => {
    scene(
      { update, view: searchView },
      given(initial),
      expect(selector("div.bg-search")).toHaveClass("h-9"),
      expect(selector("div.bg-search")).toHaveClass("flex-[0_1_20rem]"),
      expect(selector("div.bg-search")).toHaveClass("max-tablet:basis-full")
    )
  })
})

describe("a button that opens a menu", () => {
  it("has a chevron after its label, hidden from assistive technology, and tighter padding", () => {
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) =>
          h.div(
            [],
            [
              h.button(
                [h.Class(buttonClass({ hasChevron: true }))],
                buttonContent(h, "Active members", { hasChevron: true })
              ),
              h.button([h.Class(buttonClass())], buttonContent(h, "Invite people"))
            ]
          )
      },
      given(initial),
      expect(role("button", { name: "Active members" })).toHaveClass("px-3"),
      expect(role("button", { name: "Active members" })).not.toHaveClass("px-4"),
      expect(within(role("button", { name: "Active members" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(role("button", { name: "Invite people" })).toHaveClass("px-4"),
      expect(within(role("button", { name: "Invite people" }), selector("svg"))).toBeAbsent()
    )
  })

  it("takes a stronger border while its menu is open", () => {
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) =>
          h.button([h.Class(buttonClass({ hasChevron: true }))], buttonContent(h, "Status"))
      },
      given(initial),
      expect(role("button", { name: "Status" })).toHaveClass("aria-expanded:border-outline-strong")
    )
  })
})

const Visibility = Schema.Literals(["Public", "Private"])
type Visibility = typeof Visibility.Type

const VisibilityGroup = RadioGroup.create<Visibility>()

const VisibilityModel = Schema.Struct({
  group: VisibilityGroup.Model,
  visibility: Visibility
})

const VisibilityDefinition = makeApplicationDefinition({ Model: VisibilityModel, Message: Schema.Never })

const VisibilityBinding = VisibilityDefinition.bindChild(VisibilityGroup, {
  field: "group",
  init: { contextToArgs: () => [{ id: "visibility" }] },
  outMessage: {
    fold: VisibilityGroup.OutMessage.match({
      Selected: ({ value }) => VisibilityDefinition.stepFields(() => ({ visibility: () => value }))
    })
  }
})

const VisibilityComposition = VisibilityDefinition.makeComposition({ bindings: [VisibilityBinding] })

const visibilityInit = VisibilityComposition.makeInit((visibility: Visibility) => ({ model: { visibility } }))

const visibilityUpdate = VisibilityComposition.makeUpdate()

const visibilityChoices: ReadonlyArray<readonly [Visibility, string]> = [
  ["Public", "Public"],
  ["Private", "Private"]
]

const visibilityView = (isDisabled: boolean) =>
  VisibilityComposition.makeView((model, h) =>
    choiceGroup(h, {
      id: "visibility",
      label: "Visibility",
      choices: visibilityChoices,
      value: model.visibility,
      hint: "Only people added to this group can find it.",
      isDisabled,
      embed: (viewInputs) =>
        h.block(VisibilityBinding.embedView({ slotId: "visibility", model: model.group, viewInputs }))
    })
  )

const focusedOption = Command.resolve(RadioGroup.test.FocusOption, VisibilityGroup.Message.CompletedFocusOption())

describe("choiceGroup", () => {
  it("is a radio group named by its label, with one radio for each choice", () => {
    scene(
      { update: visibilityUpdate, view: visibilityView(false) },
      given(visibilityInit("Private").model),
      expect(role("radiogroup", { name: "Visibility" })).toExist(),
      expect(role("radio", { name: "Public" })).toExist(),
      expect(role("radio", { name: "Private" })).toExist(),
      expect(role("radio", { name: "Private" })).toHaveAttr("aria-checked", "true"),
      expect(role("radio", { name: "Public" })).toHaveAttr("aria-checked", "false")
    )
  })

  it("describes the group by the hint under it", () => {
    scene(
      { update: visibilityUpdate, view: visibilityView(false) },
      given(visibilityInit("Private").model),
      expect(text("Only people added to this group can find it.")).toExist(),
      expect(role("radiogroup", { name: "Visibility" })).toHaveAccessibleDescription(
        "Only people added to this group can find it."
      )
    )
  })

  it("chooses the one clicked", () => {
    scene(
      { update: visibilityUpdate, view: visibilityView(false) },
      given(visibilityInit("Private").model),
      click(role("radio", { name: "Public" })),
      focusedOption,
      expect(role("radio", { name: "Public" })).toHaveAttr("aria-checked", "true"),
      expect(role("radio", { name: "Private" })).toHaveAttr("aria-checked", "false")
    )
  })

  it("moves the choice with the arrow keys", () => {
    scene(
      { update: visibilityUpdate, view: visibilityView(false) },
      given(visibilityInit("Private").model),
      keydown(role("radio", { name: "Private" }), "ArrowLeft"),
      focusedOption,
      expect(role("radio", { name: "Public" })).toHaveAttr("aria-checked", "true")
    )
  })

  it("is disabled as a whole while it is told", () => {
    scene(
      { update: visibilityUpdate, view: visibilityView(true) },
      given(visibilityInit("Public").model),
      expect(role("radio", { name: "Public" })).toHaveAttr("aria-checked", "true"),
      expect(role("radio", { name: "Public" })).toHaveAttr("aria-disabled", "true"),
      expect(role("radio", { name: "Private" })).toHaveAttr("aria-disabled", "true"),
      expect(role("radio", { name: "Private" })).toBeDisabled()
    )
  })
})

describe("field maxLength", () => {
  it("limits the input to the most characters it takes, and sets no limit unless given one", () => {
    scene(
      {
        update,
        view: viewOf((model, h) => [
          field(
            h,
            {
              id: "email",
              label: "Email",
              type: "email",
              value: model.email,
              maxLength: 80,
              onInput: (value) => Message.TypedEmail({ value })
            },
            Option.none()
          )
        ])
      },
      given(initial),
      expect(label("Email")).toHaveAttr("maxLength", "80")
    )
    scene(
      { update, view: viewOf((model, h) => [emailField(model, h, Option.none())]) },
      given(initial),
      expect(label("Email")).not.toHaveAttr("maxLength")
    )
  })
})

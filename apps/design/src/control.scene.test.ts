import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  change,
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
  submit,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  answerKeys,
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  fieldGrid,
  hint,
  iconButton,
  iconSubmit,
  notice,
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
})

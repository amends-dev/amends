import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { centered, copy, heading } from "../src/centered.ts"
import { button, choiceSelect, field, hint, notice, sending, submit, textarea, toggle } from "../src/control.ts"
import { row, section } from "../src/directory.ts"
import { form, inline, valueWithAction } from "../src/form.ts"
import { type ApplicationViewBuilder, ApplicationComposition } from "./composition.ts"
import { Message, type Plan } from "./definition.ts"

const pageColumn = "mx-auto flex max-w-3xl flex-col px-6 py-8"

const pageTitle = "pb-4 text-display font-medium"

const groupColumn = "flex flex-col gap-6 border-t border-divider py-8"

const groupTitle = "text-heading font-semibold"

const sampleColumn = "flex flex-col gap-3"

const sampleCaption = "text-meta font-medium tracking-wide text-ink-muted uppercase"

const sampleRow = "flex flex-wrap items-center gap-3"

const sampleStack = "flex max-w-sm flex-col gap-4"

const screenFrame = "h-144 outline outline-outline [--amends-screen-height:36rem]"

const planChoices: ReadonlyArray<readonly [Plan, string]> = [
  ["free", "Free"],
  ["team", "Team"],
  ["enterprise", "Enterprise"]
]

const workspaces: ReadonlyArray<Readonly<{ name: string; meta: string }>> = [
  { name: "Mercier & Co", meta: "12 members · as Alex" },
  { name: "Fieldwork", meta: "4 members · as Alex" }
]

const emailError = (email: string): Option.Option<string> =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? Option.none() : Option.some("Enter a complete email address.")

const group = (h: ApplicationViewBuilder, title: string, samples: ReadonlyArray<Html>): Html =>
  h.section([h.Class(groupColumn)], [h.h2([h.Class(groupTitle)], [title]), ...samples])

const sample = (
  h: ApplicationViewBuilder,
  caption: string,
  content: ReadonlyArray<Html>,
  className = sampleRow
): Html =>
  h.div([h.Class(sampleColumn)], [h.h3([h.Class(sampleCaption)], [caption]), h.div([h.Class(className)], content)])

const buttonGroup = (h: ApplicationViewBuilder, pressCount: number): Html => {
  const press = Message.ClickedButton()

  return group(h, "Buttons", [
    sample(h, "Variants", [
      button(h, "Primary", press, { variant: "primary" }),
      button(h, "Secondary", press),
      button(h, "Quiet", press, { variant: "quiet" }),
      h.p([h.Role("status")], [`Pressed ${pressCount} times`])
    ]),
    sample(h, "Disabled", [
      button(h, "Primary", press, { variant: "primary", isDisabled: true }),
      button(h, "Secondary", press, { isDisabled: true }),
      button(h, "Quiet", press, { variant: "quiet", isDisabled: true })
    ]),
    sample(h, "Large", [
      button(h, "Primary", press, { variant: "primary", size: "large" }),
      button(h, "Secondary", press, { size: "large" }),
      button(h, "Quiet", press, { variant: "quiet", size: "large" })
    ]),
    sample(
      h,
      "Wide",
      [button(h, "Primary", press, { variant: "primary", wide: true }), button(h, "Secondary", press, { wide: true })],
      sampleStack
    ),
    sample(h, "Submit", [h.form([h.OnSubmit(press)], [submit(h, "Send a code")])]),
    sample(h, "Link", [
      h.p([], ["Wrong address? ", button(h, "Change email", press, { variant: "link" })]),
      button(h, "Disabled link", press, { variant: "link", isDisabled: true })
    ])
  ])
}

const fieldGroup = (
  h: ApplicationViewBuilder,
  model: Readonly<{ workspaceName: string; fullName: string; email: string; signInEmail: string; notes: string }>
): Html =>
  group(h, "Fields", [
    sample(
      h,
      "Empty",
      [
        field(
          h,
          {
            id: "workspace-name",
            label: "Workspace name",
            type: "text",
            value: model.workspaceName,
            onInput: (value) => Message.TypedWorkspaceName({ value }),
            isAutofocus: false
          },
          Option.none()
        )
      ],
      sampleStack
    ),
    sample(
      h,
      "Filled",
      [
        field(
          h,
          {
            id: "full-name",
            label: "Full name",
            type: "text",
            value: model.fullName,
            onInput: (value) => Message.TypedFullName({ value }),
            isAutofocus: false
          },
          Option.none()
        )
      ],
      sampleStack
    ),
    sample(
      h,
      "Invalid",
      [
        field(
          h,
          {
            id: "email",
            label: "Email",
            type: "email",
            value: model.email,
            onInput: (value) => Message.TypedEmail({ value }),
            isAutofocus: false
          },
          emailError(model.email)
        )
      ],
      sampleStack
    ),
    sample(
      h,
      "Placeholder",
      [
        field(
          h,
          {
            id: "sign-in-email",
            label: "Email",
            type: "email",
            value: model.signInEmail,
            placeholder: "you@example.com",
            onInput: (value) => Message.TypedSignInEmail({ value }),
            isAutofocus: false
          },
          Option.none()
        )
      ],
      sampleStack
    ),
    sample(h, "Hint", [hint(h, "Use your most recent code.")], sampleStack),
    sample(
      h,
      "Textarea",
      [
        textarea(h, {
          id: "notes",
          label: "Notes",
          value: model.notes,
          onInput: (value) => Message.TypedNotes({ value })
        })
      ],
      sampleStack
    )
  ])

const toggleGroup = (h: ApplicationViewBuilder, isNotificationsOn: boolean, isDigestOn: boolean): Html =>
  group(h, "Toggle", [
    sample(
      h,
      "On and off",
      [
        toggle(h, {
          id: "notifications",
          label: "Notifications",
          isOn: isNotificationsOn,
          onToggle: (isOn) => Message.ToggledNotifications({ isOn })
        }),
        toggle(h, {
          id: "digest",
          label: "Weekly digest",
          isOn: isDigestOn,
          onToggle: (isOn) => Message.ToggledDigest({ isOn })
        })
      ],
      sampleStack
    )
  ])

const selectGroup = (h: ApplicationViewBuilder, plan: Plan): Html =>
  group(h, "Select", [
    sample(
      h,
      "Choice",
      [
        choiceSelect(h, {
          id: "plan",
          label: "Plan",
          choices: planChoices,
          value: plan,
          onChange: (nextPlan) => Message.ChangedPlan({ plan: nextPlan })
        })
      ],
      sampleStack
    )
  ])

const noticeGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Notices", [
    sample(
      h,
      "Tones",
      [
        notice(h, Option.some("That code is not right."), { tone: "danger" }),
        notice(h, Option.some("Setup is not finished."), { tone: "caution" }),
        notice(h, Option.some("Saved."), { tone: "success" })
      ],
      sampleStack
    ),
    sample(h, "Sending", [h.p([], ["Rename workspace", sending(h, true)])])
  ])

const emailScreen = (h: ApplicationViewBuilder, signInEmail: string): Html =>
  centered(h, {
    brand: "amends",
    width: "form",
    children: [
      heading(h, "Sign in to amends"),
      copy(h, "Use your email to get a one-time code."),
      form(h, { onSubmit: Message.ClickedButton(), label: "Sign in" }, [
        field(
          h,
          {
            id: "screen-email",
            label: "Email",
            type: "email",
            value: signInEmail,
            placeholder: "you@example.com",
            onInput: (value) => Message.TypedSignInEmail({ value }),
            isAutofocus: false
          },
          Option.none()
        ),
        submit(h, "Continue", { size: "large", wide: true }),
        hint(h, "Your workspaces appear after you sign in.")
      ])
    ]
  })

const codeScreen = (h: ApplicationViewBuilder, code: string): Html =>
  centered(h, {
    brand: "amends",
    width: "form",
    children: [
      heading(h, "Enter your code"),
      copy(h, "Enter the six-digit code for"),
      valueWithAction(
        h,
        "alex@mercier.example",
        button(h, "Change email", Message.ClickedButton(), { variant: "link" })
      ),
      form(h, { onSubmit: Message.ClickedButton(), label: "Verify" }, [
        field(
          h,
          {
            id: "screen-code",
            label: "Verification code",
            type: "text",
            value: code,
            onInput: (value) => Message.TypedCode({ value }),
            isAutofocus: false
          },
          Option.none()
        ),
        hint(h, "Use your most recent code."),
        submit(h, "Verify code", { size: "large", wide: true }),
        inline(h, ["Need a new code?", button(h, "Send again", Message.ClickedButton(), { variant: "link" })])
      ])
    ]
  })

const workspaceList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [],
    workspaces.map(({ name, meta }) =>
      h.keyed("li")(
        name,
        [],
        [row(h, { mark: name.slice(0, 1), title: name, meta, action: "Open →", onClick: Message.ClickedButton() })]
      )
    )
  )

const directoryScreen = (h: ApplicationViewBuilder): Html =>
  centered(h, {
    brand: "amends",
    actions: [inline(h, ["alex@mercier.example"]), button(h, "Sign out", Message.ClickedButton())],
    width: "directory",
    children: [
      heading(h, "Choose a workspace"),
      copy(h, `${workspaces.length} workspaces`),
      section(h, { label: "Your workspaces", count: workspaces.length }),
      workspaceList(h)
    ]
  })

const directoryGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Directory", [
    sample(
      h,
      "Section and rows",
      [section(h, { label: "Your workspaces", count: workspaces.length }), workspaceList(h)],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Row without meta or action",
      [row(h, { mark: "N", title: "Northstar Studio", onClick: Message.ClickedButton() })],
      "flex max-w-2xl flex-col"
    ),
    sample(h, "Section without count", [section(h, { label: "Invitations" })], "flex max-w-2xl flex-col")
  ])

const formGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Form", [
    sample(
      h,
      "Form, inline text, and a value with its link",
      [
        valueWithAction(
          h,
          "alex@mercier.example",
          button(h, "Change email", Message.ClickedButton(), { variant: "link" })
        ),
        form(h, { onSubmit: Message.ClickedButton(), label: "Example" }, [
          submit(h, "Verify code", { size: "large", wide: true }),
          inline(h, ["Need a new code?", button(h, "Send again", Message.ClickedButton(), { variant: "link" })])
        ])
      ],
      sampleStack
    )
  ])

const centeredGroup = (h: ApplicationViewBuilder, signInEmail: string, code: string): Html =>
  group(h, "Centered screen", [
    sample(
      h,
      "Form width, email step",
      [h.div([h.Class(screenFrame)], [emailScreen(h, signInEmail)])],
      "flex flex-col"
    ),
    sample(h, "Form width, code step", [h.div([h.Class(screenFrame)], [codeScreen(h, code)])], "flex flex-col"),
    sample(h, "Directory width", [h.div([h.Class(screenFrame)], [directoryScreen(h)])], "flex flex-col")
  ])

export const view = ApplicationComposition.makeView((model, h) => ({
  title: "amends design workshop",
  body: h.div(
    [h.Class(pageColumn)],
    [
      h.h1([h.Class(pageTitle)], ["amends design workshop"]),
      buttonGroup(h, model.pressCount),
      fieldGroup(h, model),
      toggleGroup(h, model.isNotificationsOn, model.isDigestOn),
      selectGroup(h, model.plan),
      noticeGroup(h),
      formGroup(h),
      directoryGroup(h),
      centeredGroup(h, model.signInEmail, model.code)
    ]
  )
}))

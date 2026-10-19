import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { centered, copy, heading } from "../src/centered.ts"
import { button, choiceSelect, field, notice, sending, submit, textarea, toggle } from "../src/control.ts"
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

const formStack = "mt-9 flex flex-col gap-4"

const planChoices: ReadonlyArray<readonly [Plan, string]> = [
  ["free", "Free"],
  ["team", "Team"],
  ["enterprise", "Enterprise"]
]

const workspaces = ["Mercier & Co", "Northwind", "Contoso"]

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
    sample(h, "Submit", [h.form([h.OnSubmit(press)], [submit(h, "Send a code")])])
  ])
}

const fieldGroup = (
  h: ApplicationViewBuilder,
  model: Readonly<{ workspaceName: string; fullName: string; email: string; notes: string }>
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

const formScreen = (h: ApplicationViewBuilder, code: string): Html =>
  centered(h, {
    brand: "amends",
    actions: [button(h, "Sign out", Message.ClickedButton(), { variant: "quiet" })],
    width: "form",
    children: [
      heading(h, "Sign in"),
      copy(h, "Enter the code sent to ada@example.com"),
      h.form(
        [h.OnSubmit(Message.ClickedButton()), h.Class(formStack)],
        [
          field(
            h,
            {
              id: "code",
              label: "Code",
              type: "text",
              value: code,
              onInput: (value) => Message.TypedCode({ value }),
              isAutofocus: false
            },
            Option.none()
          ),
          submit(h, "Sign in", { size: "large", wide: true })
        ]
      )
    ]
  })

const directoryScreen = (h: ApplicationViewBuilder): Html =>
  centered(h, {
    brand: "amends",
    actions: [button(h, "Sign out", Message.ClickedButton(), { variant: "quiet" })],
    width: "directory",
    children: [
      heading(h, "Choose a workspace"),
      copy(h, "Pick one to open."),
      h.div(
        [h.Class(formStack)],
        workspaces.map((name) => button(h, name, Message.ClickedButton(), { size: "large", wide: true }))
      )
    ]
  })

const centeredGroup = (h: ApplicationViewBuilder, code: string): Html =>
  group(h, "Centered screen", [
    sample(h, "Form width", [h.div([h.Class(screenFrame)], [formScreen(h, code)])], "flex flex-col"),
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
      centeredGroup(h, model.code)
    ]
  )
}))

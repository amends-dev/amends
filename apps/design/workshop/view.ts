import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { centered, copy, heading } from "../src/centered.ts"
import {
  button,
  choiceSelect,
  field,
  hint,
  iconButton,
  notice,
  sending,
  submit,
  textarea,
  toggle
} from "../src/control.ts"
import { row, section } from "../src/directory.ts"
import { form, inline, valueWithAction } from "../src/form.ts"
import { type IconName, icon } from "../src/icon.ts"
import { pane, paneClose, paneColumn, paneTabs } from "../src/pane.ts"
import { rail } from "../src/rail.ts"
import { shell } from "../src/shell.ts"
import {
  sidebar,
  sidebarEmpty,
  sidebarFooter,
  sidebarHeader,
  sidebarItem,
  sidebarSection,
  sidebarSections
} from "../src/sidebar.ts"
import { toast, toastStack } from "../src/toast.ts"
import { type ApplicationViewBuilder, ApplicationComposition } from "./composition.ts"
import { type Destination, Message, type Model, type PaneTab, type Plan } from "./definition.ts"

const pageColumn = "mx-auto flex max-w-3xl flex-col px-6 py-8"

const wideColumn = "flex flex-col px-6 pb-8"

const pageTitle = "pb-4 text-display font-medium"

const groupColumn = "flex flex-col gap-6 border-t border-divider py-8"

const groupTitle = "text-heading font-semibold"

const sampleColumn = "flex flex-col gap-3"

const sampleCaption = "text-meta font-medium tracking-wide text-ink-muted uppercase"

const sampleRow = "flex flex-wrap items-center gap-3"

const sampleStack = "flex max-w-sm flex-col gap-4"

const screenFrame = "h-144 outline outline-outline [--amends-screen-height:36rem]"

const shellFrame = "h-176 outline outline-outline [--amends-screen-height:44rem]"

const toastFrame = "relative h-64 bg-canvas outline outline-outline"

const iconSizeRow = "flex items-end gap-4"

const iconGrid = "grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4"

const iconCell = "flex items-center gap-2 text-hint text-ink-secondary"

const lineColumn = "flex flex-col gap-5"

const lineGroup = "flex flex-col gap-0.5"

const lineLabel = "text-item font-medium text-ink"

const lineText = "text-body text-ink"

const railDestinations: ReadonlyArray<Readonly<{ destination: Destination; icon: IconName; label: string }>> = [
  { destination: "home", icon: "mark-home", label: "Home" },
  { destination: "connections", icon: "mark-connections", label: "Connections" },
  { destination: "agents", icon: "mark-agents", label: "Agents" },
  { destination: "channels", icon: "mark-channel", label: "Channels" }
]

const railSettings = { destination: "settings", icon: "mark-settings", label: "Settings" } as const

const iconNames: ReadonlyArray<IconName> = [
  "mark-home",
  "mark-connections",
  "mark-agents",
  "mark-channel",
  "mark-settings",
  "mark-mail",
  "mark-triage",
  "mark-tasks",
  "mark-search",
  "mark-new",
  "mark-menu",
  "mark-close",
  "message",
  "circle-frame",
  "bell",
  "bell-filled"
]

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

const iconGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Icons", [
    sample(
      h,
      "Sizes",
      [
        icon(h, "mark-channel", { size: "xs" }),
        icon(h, "mark-channel", { size: "sm" }),
        icon(h, "mark-channel"),
        icon(h, "mark-channel", { size: "lg" })
      ],
      iconSizeRow
    ),
    sample(
      h,
      "Drawn from the catalog",
      iconNames.map((name) => h.div([h.Class(iconCell)], [icon(h, name), name])),
      iconGrid
    ),
    sample(h, "Named, which makes it an image", [icon(h, "alert-triangle", { label: "Needs attention" })])
  ])

const labelledLines = (h: ApplicationViewBuilder, lines: ReadonlyArray<readonly [string, string]>): Html =>
  h.div(
    [h.Class(lineColumn)],
    lines.map(([author, text]) =>
      h.div([h.Class(lineGroup)], [h.span([h.Class(lineLabel)], [author]), h.p([h.Class(lineText)], [text])])
    )
  )

const shellRail = (h: ApplicationViewBuilder, current: Destination): Html => {
  const toItem = (item: Readonly<{ destination: Destination; icon: IconName; label: string }>) => ({
    icon: item.icon,
    label: item.label,
    isCurrent: item.destination === current,
    onClick: Message.ChangedDestination({ destination: item.destination })
  })

  return rail(h, {
    brand: { letter: "A", label: "amends" },
    items: railDestinations.map(toItem),
    footer: [toItem(railSettings)],
    account: { letter: "JM", label: "Account", onClick: Message.ClickedButton() }
  })
}

const shellSidebar = (h: ApplicationViewBuilder, isThreadOpen: boolean, isDirectMessagesEmpty: boolean): Html => {
  const press = Message.ClickedButton()

  return sidebar(h, {
    label: "Workspace",
    header: sidebarHeader(h, {
      mark: "M",
      name: "Mercier & Co",
      actions: [iconButton(h, { icon: "mark-menu", label: "Switch workspace", onClick: press })],
      search: { label: "Find anything…", shortcut: "⌘ K", onClick: press }
    }),
    children: [
      sidebarSection(h, {
        children: [
          sidebarItem(h, { icon: "mark-mail", label: "Inbox", count: 3, isCurrent: false, onClick: press }),
          sidebarItem(h, { icon: "mark-triage", label: "Triage", isCurrent: false, onClick: press }),
          sidebarItem(h, { icon: "mark-tasks", label: "Tasks", isCurrent: false, onClick: press })
        ]
      }),
      sidebarSections(h, [
        sidebarSection(h, {
          label: "Groups",
          actions: [
            iconButton(h, { icon: "mark-search", label: "Search groups", onClick: press }, { size: "compact" }),
            iconButton(h, { icon: "mark-new", label: "Create group", onClick: press }, { size: "compact" })
          ],
          children: [
            sidebarItem(h, {
              icon: "mark-channel",
              label: "general",
              isCurrent: true,
              onClick: press,
              children: [
                isThreadOpen
                  ? { icon: "circle-frame", label: "Composer paste crash", isCurrent: true }
                  : { icon: "circle-frame", label: "Composer paste crash", isCurrent: false, onClick: press }
              ]
            }),
            sidebarItem(h, { icon: "mark-channel", label: "design", isCurrent: false, onClick: press }),
            sidebarItem(h, { icon: "mark-channel", label: "engineering", isCurrent: false, onClick: press })
          ]
        }),
        sidebarSection(h, {
          label: "Direct messages",
          actions: [iconButton(h, { icon: "mark-new", label: "New message", onClick: press }, { size: "compact" })],
          children: isDirectMessagesEmpty
            ? [sidebarEmpty(h, "No conversations yet")]
            : [
                sidebarItem(h, { mark: "AM", label: "Alex Morgan", isCurrent: false, onClick: press }),
                sidebarItem(h, { mark: "Y", label: "Yumi", isCurrent: false, onClick: press })
              ]
        })
      ])
    ],
    footer: sidebarFooter(h, [hint(h, "12 members · as Alex")])
  })
}

const groupPane = (h: ApplicationViewBuilder, paneTab: PaneTab, composer: string): Html => {
  const press = Message.ClickedButton()

  return pane(h, {
    variant: "main",
    header: {
      title: "general",
      icon: "mark-channel",
      actions: [
        iconButton(h, { icon: "bell", label: "Notifications", onClick: press }),
        iconButton(h, { icon: "mark-settings", label: "Group settings", onClick: press })
      ],
      tabs: paneTabs(h, {
        label: "Group",
        tabs: [
          {
            label: "Threads",
            isCurrent: paneTab === "threads",
            onClick: Message.ChangedPaneTab({ tab: "threads" })
          },
          {
            label: "Tasks",
            count: 12,
            isCurrent: paneTab === "tasks",
            onClick: Message.ChangedPaneTab({ tab: "tasks" })
          }
        ]
      })
    },
    body: [
      paneTab === "threads"
        ? labelledLines(h, [
            ["Alex", "The preview is ready for another look. I've linked the latest notes in the task."],
            ["Sara", "Looks good. I'll keep an eye on the release this morning."],
            ["Oliver", "morning all!"],
            ["AJ", "found a bug. composer crashes when I paste an image from clipboard lol"],
            ["Graeme", "@Caleb Let's grab some coffee"]
          ])
        : labelledLines(h, [
            ["Composer paste crash", "AND-214 · In progress"],
            ["Retry keeps the original request", "AND-209 · Ready for another look"]
          ])
    ],
    footer: [
      textarea(h, {
        id: "composer",
        label: "Message #general",
        value: composer,
        onInput: (value) => Message.TypedComposer({ value })
      })
    ]
  })
}

const threadPane = (h: ApplicationViewBuilder, reply: string): Html =>
  pane(h, {
    variant: "side",
    label: "Composer paste crash",
    header: {
      title: "Composer paste crash",
      icon: "message",
      subtitle: "Thread in #general",
      actions: [paneClose(h, Message.ClickedButton())]
    },
    body: [
      labelledLines(h, [
        ["AJ", "found a bug. composer crashes when I paste an image from clipboard lol"],
        ["Alex", "uh oh — repro on mac or everywhere?"],
        ["Yumi", "Reproduced on both — images over 5 MB hit the crash. Filed it and tagged the composer team."],
        ["AJ", "Thanks! I'll attach the image to the task."]
      ])
    ],
    footer: [
      textarea(h, {
        id: "reply",
        label: "Reply in thread",
        value: reply,
        onInput: (value) => Message.TypedReply({ value })
      })
    ]
  })

const agentPane = (h: ApplicationViewBuilder): Html =>
  pane(h, {
    variant: "main",
    header: {
      title: "Yumi",
      mark: "Y",
      context: "Agent",
      subtitle: "Reads the repository and files what it finds as tasks.",
      actions: [button(h, "New task", Message.ClickedButton(), { variant: "primary" })]
    },
    body: [
      paneColumn(h, [
        labelledLines(h, [
          ["Model", "A model the workspace's connections provide."],
          ["Tools", "Search the repository, read files, and file tasks."]
        ]),
        hint(h, "One column of sections, with nothing beside it.")
      ])
    ]
  })

const renameRefusal = (h: ApplicationViewBuilder): Html =>
  toast(h, {
    text: "Couldn't rename the thread: You may not rename this thread.",
    action: { label: "Dismiss", onClick: Message.ClickedButton() }
  })

const postRefusal = (h: ApplicationViewBuilder): Html =>
  toast(h, {
    text: "Couldn't post the reply: This browser could not keep that. Try again.",
    detail: "Thanks! I'll attach the image to the task.",
    action: { label: "Dismiss", onClick: Message.ClickedButton() }
  })

const toastGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Toast", [
    sample(h, "One toast", [h.div([h.Class(toastFrame)], [toastStack(h, [renameRefusal(h)])])], "flex flex-col"),
    sample(
      h,
      "With the text it refused",
      [h.div([h.Class(toastFrame)], [toastStack(h, [postRefusal(h)])])],
      "flex flex-col"
    ),
    sample(
      h,
      "A stack of two",
      [h.div([h.Class(toastFrame)], [toastStack(h, [renameRefusal(h), postRefusal(h)])])],
      "flex flex-col"
    )
  ])

const shellGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  group(h, "Shell", [
    sample(
      h,
      "Rail, sidebar, main pane, and side pane",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              rail: shellRail(h, model.destination),
              sidebar: shellSidebar(h, true, false),
              main: groupPane(h, model.paneTab, model.composer),
              aside: threadPane(h, model.reply)
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "Without the side pane: a page about one item, a section with no items, and notices",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              rail: shellRail(h, model.destination),
              sidebar: shellSidebar(h, false, true),
              main: agentPane(h),
              notices: toastStack(h, [renameRefusal(h), postRefusal(h)])
            })
          ]
        )
      ],
      "flex flex-col"
    )
  ])

export const view = ApplicationComposition.makeView((model, h) => ({
  title: "amends design workshop",
  body: h.div(
    [],
    [
      h.div(
        [h.Class(pageColumn)],
        [
          h.h1([h.Class(pageTitle)], ["amends design workshop"]),
          buttonGroup(h, model.pressCount),
          fieldGroup(h, model),
          toggleGroup(h, model.isNotificationsOn, model.isDigestOn),
          selectGroup(h, model.plan),
          noticeGroup(h),
          toastGroup(h),
          iconGroup(h),
          formGroup(h),
          directoryGroup(h),
          centeredGroup(h, model.signInEmail, model.code)
        ]
      ),
      h.div([h.Class(wideColumn)], [shellGroup(h, model)])
    ]
  )
}))

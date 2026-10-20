import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { centered, copy, heading, screenContent } from "../src/centered.ts"
import { composer } from "../src/composer.ts"
import {
  button,
  buttonRow,
  type Choice,
  choiceSelect,
  column,
  field,
  fieldGrid,
  hint,
  iconButton,
  link,
  notice,
  noticeBox,
  sending,
  submit,
  textarea,
  toggle
} from "../src/control.ts"
import { badge, detailList, entry, entryList, log } from "../src/details.ts"
import {
  activityCell,
  cellWithDetail,
  columns,
  footnote,
  row,
  rowWithButton,
  section,
  summary
} from "../src/directory.ts"
import { form, inline, settingRow, valueWithAction } from "../src/form.ts"
import { type IconName, icon } from "../src/icon.ts"
import { activityMark, type MarkSize, type MarkStatus, mark, markCluster, statusMark } from "../src/mark.ts"
import { divider, message, messageList, notification, replyLine, type TextRun } from "../src/message.ts"
import { modal } from "../src/modal.ts"
import { pane, paneBack, paneClose, paneColumn, paneEmpty, paneForm, paneSection, paneTabs } from "../src/pane.ts"
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
import { type ApplicationViewBuilder, ApplicationComposition, ModalBinding, WideModalBinding } from "./composition.ts"
import {
  type Destination,
  Message,
  type Model,
  type PaneTab,
  type Plan,
  type TaskAssignee,
  type TaskPriority,
  type TaskStatus
} from "./definition.ts"

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

const shellFrame = "h-176 outline outline-outline [contain:layout] [--amends-screen-height:44rem]"

const toastFrame = "h-64 bg-canvas outline outline-outline [contain:layout]"

const iconSizeRow = "flex items-end gap-4"

const conversationColumn = "flex max-w-xl flex-col px-3"

const composerColumn = "flex max-w-md flex-col"

const mentioningColumn = "flex max-w-md flex-col pt-24"

const emptyPaneFrame = "flex h-96 flex-col outline outline-outline"

const columnPaneFrame = "flex h-96 max-w-5xl flex-col outline outline-outline"

const sidePaneColumn = "flex w-98 flex-col"

const tableColumn = "flex w-full max-w-2xl flex-col gap-3"

const tableFrame = "h-96 w-90 flex-none outline outline-outline"

const tableFrameBody = "flex flex-col gap-3 p-4"

const iconGrid = "grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4"

const iconCell = "flex items-center gap-2 text-hint text-ink-secondary"

const lineColumn = "flex flex-col gap-5"

const lineGroup = "flex flex-col gap-0.5"

const lineLabel = "text-item font-medium text-ink"

const lineText = "text-body text-ink"

const railDestinations: ReadonlyArray<Readonly<{ destination: Destination; icon: IconName; label: string }>> = [
  { destination: "home", icon: "mark-home", label: "Home" },
  { destination: "agents", icon: "mark-agents", label: "Agents" },
  { destination: "connections", icon: "mark-connections", label: "Connections" }
]

const railSettings = { destination: "settings", icon: "mark-settings", label: "Settings" } as const

const online: MarkStatus = { kind: "available", label: "Online" }

const needsSetup: MarkStatus = {
  kind: "attention",
  label: "Needs setup",
  detail: "Its model connection was removed."
}

const unavailable: MarkStatus = {
  kind: "blocked",
  label: "Unavailable",
  detail: "Its integration isn't installed on this host."
}

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

const taskStatusChoices: ReadonlyArray<readonly [TaskStatus, string]> = [
  ["triage", "Triage"],
  ["todo", "To do"],
  ["doing", "Doing"]
]

const taskPriorityChoices: ReadonlyArray<readonly [TaskPriority, string]> = [
  ["none", "No priority"],
  ["low", "Low"],
  ["high", "High"]
]

const harnessChoices: ReadonlyArray<Choice<string>> = [
  ["", "Auto", { description: "amends chooses a harness as the agent works" }],
  ["amends", "Amends harness", { description: "amends · Works on this host" }],
  ["opencode", "opencode", { description: "opencode · Works only in a sandbox" }],
  ["vertex", "Vertex", { description: "Its integration isn't installed on this host.", isDisabled: true }]
]

const taskAssigneeChoices: ReadonlyArray<readonly [TaskAssignee, string]> = [
  ["", "No one"],
  ["alex", "Alex Morgan"],
  ["yumi", "Yumi"]
]

const workspaces: ReadonlyArray<Readonly<{ name: string; meta: string }>> = [
  { name: "Mercier & Co", meta: "12 members" },
  { name: "Fieldwork", meta: "4 members · Owner" }
]

const invitations: ReadonlyArray<Readonly<{ name: string; meta: string }>> = [
  { name: "Northstar Studio", meta: "Pending invitation · Expires in 7 days" },
  { name: "Atlas Labs", meta: "Pending invitation · Expires in 3 days" }
]

const groupRows: ReadonlyArray<Readonly<{ name: string; visibility: string; members: number }>> = [
  { name: "design", visibility: "Public", members: 12 },
  { name: "engineering", visibility: "Private", members: 9 },
  { name: "product", visibility: "Public", members: 8 }
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
    sample(h, "Icon before the label", [
      button(h, "Create workspace", press, { icon: "mark-new" }),
      button(h, "New task", press, { variant: "primary", icon: "mark-new" }),
      button(h, "Create workspace", press, { icon: "mark-new", isDisabled: true }),
      button(h, "Create workspace", press, { icon: "mark-new", size: "large" })
    ]),
    sample(h, "Link", [
      h.p([], ["Wrong address? ", button(h, "Change email", press, { variant: "link" })]),
      button(h, "Disabled link", press, { variant: "link", isDisabled: true })
    ]),
    sample(h, "Link to another page, which opens in a new tab", [
      h.p([], ["MCP server · ", link(h, { label: "Documentation", href: "https://modelcontextprotocol.io" })])
    ]),
    sample(h, "Icon buttons, regular and compact", [
      iconButton(h, { icon: "mark-settings", label: "Settings", onClick: press }),
      iconButton(h, { icon: "mark-new", label: "New", onClick: press }, { size: "compact" })
    ]),
    sample(h, "Icon buttons as a switch, off and pressed", [
      iconButton(h, { icon: "bell", label: "Follow", onClick: press }, { isPressed: false }),
      iconButton(h, { icon: "bell-filled", label: "Unfollow", onClick: press }, { isPressed: true })
    ])
  ])
}

const taskFields = (
  h: ApplicationViewBuilder,
  model: Readonly<{ taskStatus: TaskStatus; taskPriority: TaskPriority; taskAssignee: TaskAssignee }>,
  idPrefix: string
): Html =>
  fieldGrid(h, [
    choiceSelect(h, {
      id: `${idPrefix}-status`,
      label: "Status",
      choices: taskStatusChoices,
      value: model.taskStatus,
      onChange: (status) => Message.ChangedTaskStatus({ status })
    }),
    choiceSelect(h, {
      id: `${idPrefix}-priority`,
      label: "Priority",
      choices: taskPriorityChoices,
      value: model.taskPriority,
      onChange: (priority) => Message.ChangedTaskPriority({ priority })
    }),
    choiceSelect(h, {
      id: `${idPrefix}-assignee`,
      label: "Assignee",
      choices: taskAssigneeChoices,
      value: model.taskAssignee,
      onChange: (assignee) => Message.ChangedTaskAssignee({ assignee })
    })
  ])

const fieldGroup = (
  h: ApplicationViewBuilder,
  model: Readonly<{
    workspaceName: string
    fullName: string
    email: string
    signInEmail: string
    notes: string
    taskStatus: TaskStatus
    taskPriority: TaskPriority
    taskAssignee: TaskAssignee
  }>
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
    sample(
      h,
      "Field with a hint under it",
      [
        field(
          h,
          {
            id: "hinted-email",
            label: "Email",
            type: "email",
            value: model.signInEmail,
            hint: "We send the code to this address.",
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
    ),
    sample(
      h,
      "Textarea with a hint, refused, and disabled",
      [
        textarea(h, {
          id: "instructions",
          label: "Instructions",
          value: model.notes,
          rows: 6,
          hint: "What the agent works by: its role, how it answers, and what to avoid.",
          onInput: (value) => Message.TypedNotes({ value })
        }),
        textarea(h, {
          id: "refused-instructions",
          label: "Instructions",
          value: model.notes,
          error: Option.some("The instructions are too long, or hold what can't be stored."),
          onInput: (value) => Message.TypedNotes({ value })
        }),
        textarea(h, {
          id: "disabled-instructions",
          label: "Instructions",
          value: "Read the repository, and file what you find as tasks.",
          isDisabled: true,
          onInput: (value) => Message.TypedNotes({ value })
        })
      ],
      sampleStack
    ),
    sample(
      h,
      "Disabled field",
      [
        field(
          h,
          {
            id: "disabled-name",
            label: "Agent name",
            type: "text",
            value: "Yumi",
            isDisabled: true,
            isAutofocus: false,
            onInput: (value) => Message.TypedFullName({ value })
          },
          Option.none()
        )
      ],
      sampleStack
    ),
    sample(h, "In a grid, side by side", [taskFields(h, model, "grid")], "flex max-w-xl flex-col"),
    sample(h, "In a grid, wrapping in a narrow column", [taskFields(h, model, "narrow")], sidePaneColumn),
    sample(
      h,
      "Select with its label hidden, in a row",
      [
        h.span([h.Class(lineText)], ["Alex Morgan"]),
        choiceSelect(
          h,
          {
            id: "row-status",
            label: "Status of Alex Morgan",
            choices: taskStatusChoices,
            value: model.taskStatus,
            onChange: (status) => Message.ChangedTaskStatus({ status })
          },
          { isLabelHidden: true }
        )
      ],
      sampleRow
    ),
    sample(
      h,
      "Field with its label hidden, in a section that names it",
      [
        paneSection(h, {
          title: "Your name",
          children: [
            field(
              h,
              {
                id: "section-name",
                label: "Your name",
                type: "text",
                value: model.fullName,
                onInput: (value) => Message.TypedFullName({ value }),
                isAutofocus: false,
                isLabelHidden: true
              },
              Option.none()
            )
          ]
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
    ),
    sample(
      h,
      "Disabled, on and off",
      [
        toggle(h, {
          id: "disabled-notifications",
          label: "Notifications",
          isOn: true,
          isDisabled: true,
          onToggle: (isOn) => Message.ToggledNotifications({ isOn })
        }),
        toggle(h, {
          id: "disabled-digest",
          label: "Weekly digest",
          isOn: false,
          isDisabled: true,
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
    ),
    sample(
      h,
      "With descriptions, a choice that can't be chosen, and a hint",
      [
        choiceSelect(h, {
          id: "harness",
          label: "Harness",
          choices: harnessChoices,
          value: "",
          hint: "No connection gives a harness yet. On Auto, the agent waits for one.",
          onChange: () => Message.ClickedButton()
        })
      ],
      sampleStack
    ),
    sample(
      h,
      "Refused",
      [
        choiceSelect(h, {
          id: "sandbox",
          label: "Sandbox",
          choices: harnessChoices,
          value: "opencode",
          error: Option.some("Opencode works only in a sandbox. Choose one."),
          onChange: () => Message.ClickedButton()
        })
      ],
      sampleStack
    ),
    sample(
      h,
      "Disabled",
      [
        choiceSelect(h, {
          id: "disabled-plan",
          label: "Plan",
          choices: planChoices,
          value: "team",
          isDisabled: true,
          onChange: () => Message.ClickedButton()
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
    sample(
      h,
      "Boxed note: caution with a line for each reason, danger, and success",
      [
        noticeBox(h, {
          title: "This agent can't run as it is set up",
          lines: ["Its model connection was removed.", "Its harness works only in a sandbox, and it has none."]
        }),
        noticeBox(h, { title: "Its integration isn't installed on this host", lines: [], tone: "danger" }),
        noticeBox(h, { title: "Working", lines: ["The check found nothing wrong."], tone: "success" })
      ],
      sampleStack
    ),
    sample(h, "Sending", [h.p([], ["Rename workspace", sending(h, true)])]),
    sample(
      h,
      "Column: a notice over a button, and over a Try again row",
      [
        column(h, [
          notice(h, Option.some("You may not change this task.")),
          button(h, "Make it a task", Message.ClickedButton())
        ]),
        column(h, [
          notice(h, Option.some("The host could not be reached. Try again.")),
          buttonRow(h, [button(h, "Try again", Message.ClickedButton(), { variant: "quiet" })])
        ])
      ],
      sampleStack
    )
  ])

const emailScreen = (h: ApplicationViewBuilder, signInEmail: string): Html =>
  centered(h, {
    brand: "amends",
    width: "form",
    children: [
      screenContent(h, [
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
      ])
    ]
  })

const codeScreen = (h: ApplicationViewBuilder, code: string): Html =>
  centered(h, {
    brand: "amends",
    width: "form",
    children: [
      screenContent(h, [
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
        [
          row(h, {
            mark: { text: name.slice(0, 1) },
            title: name,
            meta,
            action: "Open →",
            onClick: Message.ClickedButton()
          })
        ]
      )
    )
  )

const invitationList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [h.AriaLabel("Invitations")],
    invitations.map(({ name, meta }) =>
      h.keyed("li")(
        name,
        [],
        [
          rowWithButton(h, {
            mark: name.slice(0, 1),
            title: name,
            meta,
            action: "Accept invite",
            actionName: `Accept invite to ${name}`,
            onClick: Message.ClickedButton()
          })
        ]
      )
    )
  )

const groupList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [h.AriaLabel("Groups")],
    groupRows.map(({ name, visibility, members }) =>
      h.keyed("li")(
        name,
        [],
        [
          row(h, {
            mark: { text: "#" },
            title: name,
            cells: [badge(h, { label: visibility }), h.span([], [`${members} members`])],
            cellsText: `${visibility} · ${members} members`,
            action: "Open →",
            onClick: Message.ClickedButton()
          })
        ]
      )
    )
  )

const groupTable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  summary(h, { copy: "Public and private groups you've joined.", count: `${groupRows.length} groups` }),
  columns(h, { label: "Group", cells: ["Visibility", "Members"] }),
  groupList(h)
]

type AgentSample = Readonly<{
  name: string
  status?: MarkStatus
  harness: string
  sandbox: string
  model: string
  connection: string
  activity?: Readonly<{ state: string; place: string }>
}>

const agentSamples: ReadonlyArray<AgentSample> = [
  {
    name: "Atlas",
    status: { kind: "available", label: "Queued in #design" },
    harness: "Claude Code",
    sandbox: "Remote development",
    model: "Claude Sonnet 5",
    connection: "Anthropic · Team",
    activity: { state: "Queued", place: "#design" }
  },
  { name: "Nora", harness: "Auto", sandbox: "No sandbox", model: "Claude Haiku 4.5", connection: "Anthropic · Team" },
  {
    name: "Review helper",
    status: needsSetup,
    harness: "Auto",
    sandbox: "No sandbox",
    model: "Claude Sonnet 5",
    connection: "Anthropic · Backup"
  },
  {
    name: "Yumi",
    status: { kind: "available", label: "Working in #general" },
    harness: "Claude Code",
    sandbox: "Local development",
    model: "Claude Opus 5",
    connection: "Anthropic · Team",
    activity: { state: "Working", place: "#general" }
  }
]

type ConnectionSample = Readonly<{
  name: string
  status?: MarkStatus
  integration: string
  authentication: string
}>

const connectionSamples: ReadonlyArray<ConnectionSample> = [
  { name: "Anthropic · Team", integration: "Anthropic · Models", authentication: "API key" },
  { name: "Search tools", status: needsSetup, integration: "MCP server · Tools", authentication: "API key" },
  {
    name: "Vertex · Research",
    status: unavailable,
    integration: "Integration not installed",
    authentication: "API key"
  },
  { name: "This machine", integration: "This machine · Sandboxes", authentication: "No authentication" }
]

const connectionRow = (h: ApplicationViewBuilder, connection: ConnectionSample): Html =>
  h.keyed("li")(
    connection.name,
    [],
    [
      row(h, {
        mark: { icon: "mark-connections" },
        markSize: "md",
        ...(connection.status === undefined ? {} : { status: connection.status }),
        title: connection.name,
        meta: connection.integration,
        cells: [h.span([], [connection.authentication])],
        cellsText: connection.authentication,
        onClick: Message.ClickedButton()
      })
    ]
  )

const connectionTable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  columns(h, { label: "Connection", cells: ["Authentication"] }),
  h.ul(
    [h.AriaLabel("Connections")],
    connectionSamples.map((connection) => connectionRow(h, connection))
  )
]

const agentRow = (h: ApplicationViewBuilder, agent: AgentSample): Html =>
  h.keyed("li")(
    agent.name,
    [],
    [
      row(h, {
        mark: { text: agent.name.slice(0, 1), tone: "lilac" },
        markSize: "md",
        ...(agent.status === undefined ? {} : { status: agent.status }),
        title: agent.name,
        cells: [
          cellWithDetail(h, { value: agent.harness, detail: agent.sandbox }),
          cellWithDetail(h, { value: agent.model, detail: agent.connection }),
          agent.activity === undefined ? h.empty : activityCell(h, agent.activity)
        ],
        cellsText: [
          agent.harness,
          agent.sandbox,
          agent.model,
          agent.connection,
          ...(agent.activity === undefined ? [] : [agent.activity.state, agent.activity.place])
        ].join(" · "),
        onClick: Message.ClickedButton()
      })
    ]
  )

const agentTable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  columns(h, { label: "Agent", cells: ["Harness", "Model", "Activity"] }),
  h.ul(
    [h.AriaLabel("Agents")],
    agentSamples.map((agent) => agentRow(h, agent))
  )
]

const directoryScreen = (h: ApplicationViewBuilder, children: ReadonlyArray<Html>): Html =>
  centered(h, {
    brand: "amends",
    actions: [inline(h, ["alex@mercier.example"]), button(h, "Sign out", Message.ClickedButton())],
    width: "directory",
    children: [screenContent(h, children)]
  })

const createWorkspaceHeading = (h: ApplicationViewBuilder): Html =>
  heading(h, "Choose a workspace", {
    action: button(h, "Create workspace", Message.ClickedButton(), { icon: "mark-new" })
  })

const workspacesAndInvitations = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  createWorkspaceHeading(h),
  copy(h, `${workspaces.length} workspaces · ${invitations.length} pending invitations`),
  section(h, { label: "Your workspaces", count: workspaces.length }),
  workspaceList(h),
  section(h, { label: "Invitations", count: invitations.length }),
  invitationList(h)
]

const invitationsOnly = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  createWorkspaceHeading(h),
  copy(h, `${invitations.length} invitations waiting for you.`),
  section(h, { label: "Invitations", count: invitations.length }),
  invitationList(h),
  footnote(h, "Accept an invitation above, or create your own workspace.")
]

const noWorkspacesYet = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  heading(h, "Choose a workspace"),
  copy(h, "Create a workspace to get started."),
  paneEmpty(h, {
    icon: "mark-home",
    title: "No workspaces yet",
    copy: "Create a workspace for your team. Invitations will appear here.",
    action: button(h, "Create workspace", Message.ClickedButton(), { variant: "primary", icon: "mark-new" })
  })
]

const reloadFailed = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  createWorkspaceHeading(h),
  column(h, [
    copy(h, `${workspaces.length} workspaces`),
    notice(h, Option.some("Couldn't refresh your workspaces.")),
    buttonRow(h, [button(h, "Try again", Message.ClickedButton(), { variant: "quiet" })])
  ]),
  section(h, { label: "Your workspaces", count: workspaces.length }),
  workspaceList(h)
]

const hostUnreachable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  paneEmpty(h, {
    icon: "mark-connections",
    title: "Can't reach your workspace host",
    copy: "You're still signed in. Try again once the host is running.",
    action: button(h, "Try again", Message.ClickedButton(), { variant: "primary" }),
    level: 1
  })
]

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
      [row(h, { mark: { text: "N" }, title: "Northstar Studio", onClick: Message.ClickedButton() })],
      "flex max-w-2xl flex-col"
    ),
    sample(h, "Section without count", [section(h, { label: "Invitations" })], "flex max-w-2xl flex-col"),
    sample(
      h,
      "Rows with a button: a section and two rows, the buttons named for their workspaces",
      [section(h, { label: "Invitations", count: invitations.length }), invitationList(h)],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Footnote: a quiet line 24px under the list before it",
      [
        section(h, { label: "Invitations", count: invitations.length }),
        invitationList(h),
        footnote(h, "Accept an invitation above, or create your own workspace.")
      ],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Row with cells and no action",
      [
        row(h, {
          mark: { text: "#" },
          title: "design",
          cells: [badge(h, { label: "Public" }), h.span([], ["12 members"])],
          cellsText: "Public · 12 members",
          onClick: Message.ClickedButton()
        })
      ],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Table of agents: 32px lilac marks with a status patch (none while ready and idle), the status read after the name, cells of two lines, and the activity blank while idle",
      agentTable(h),
      "flex max-w-3xl flex-col"
    ),
    sample(
      h,
      "Table of connections: a drawing on a 32px mark with a status patch (none while ready), the integration and what it gives under the name, and the authentication as a cell",
      connectionTable(h),
      "flex max-w-3xl flex-col"
    )
  ])

/**
 * The `frame` that the workshop is opened with to show the directory table alone. A table folds by the width of the
 * window, not of what holds it, so a folded table is shown in a frame that is a window of its own, 360px wide.
 */
export const directoryTableFrame = "directory-table"

const directoryTableGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Directory table", [
    sample(
      h,
      "Summary, columns, and rows with cells, wide and folded below 48rem in a frame 360px wide",
      [
        h.div([h.Class(tableColumn)], groupTable(h)),
        h.iframe([
          h.Class(tableFrame),
          h.Title("Directory table in a window 360px wide"),
          h.Src(`?frame=${directoryTableFrame}`)
        ])
      ],
      "flex flex-wrap items-start gap-6"
    )
  ])

const formGroup = (h: ApplicationViewBuilder, taskStatus: TaskStatus): Html =>
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
    ),
    sample(
      h,
      "Setting rows: with an action, with a select, and with a label alone",
      [
        settingRow(h, {
          label: "Mercier & Co",
          copy: "Everyone in this workspace sees this name.",
          action: button(h, "Rename workspace", Message.ClickedButton())
        }),
        settingRow(h, {
          label: "Alex Morgan",
          copy: "Owner of this workspace.",
          action: choiceSelect(
            h,
            {
              id: "setting-status",
              label: "Status of Alex Morgan",
              choices: taskStatusChoices,
              value: taskStatus,
              onChange: (status) => Message.ChangedTaskStatus({ status })
            },
            { isLabelHidden: true }
          )
        }),
        settingRow(h, { label: "Mercier & Co" })
      ],
      "flex max-w-xl flex-col gap-6"
    ),
    sample(
      h,
      "Setting row, wrapping in a narrow column",
      [
        settingRow(h, {
          label: "A workspace with a name that runs on and on",
          copy: "Everyone in this workspace sees this name.",
          action: button(h, "Rename workspace", Message.ClickedButton())
        })
      ],
      "flex w-64 flex-col"
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
    sample(
      h,
      "Directory width, with workspaces and invitations",
      [h.div([h.Class(screenFrame)], [directoryScreen(h, workspacesAndInvitations(h))])],
      "flex flex-col"
    ),
    sample(
      h,
      "Directory width, with invitations only and a line after them",
      [h.div([h.Class(screenFrame)], [directoryScreen(h, invitationsOnly(h))])],
      "flex flex-col"
    ),
    sample(
      h,
      "Directory width, with nothing yet, and the empty state's action in place of the heading's",
      [h.div([h.Class(screenFrame)], [directoryScreen(h, noWorkspacesYet(h))])],
      "flex flex-col"
    ),
    sample(
      h,
      "Directory width, with a reload that failed over the list it kept",
      [h.div([h.Class(screenFrame)], [directoryScreen(h, reloadFailed(h))])],
      "flex flex-col"
    ),
    sample(
      h,
      "Directory width, with the host not reached: the message is the screen's h1",
      [h.div([h.Class(screenFrame)], [directoryScreen(h, hostUnreachable(h))])],
      "flex flex-col"
    )
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

const markStatuses: ReadonlyArray<MarkStatus> = [online, { kind: "offline", label: "Offline" }, needsSetup, unavailable]

const markSizes: ReadonlyArray<MarkSize> = ["xs", "sm", "md", "lg"]

const markGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Marks", [
    ...markStatuses.map((status) =>
      sample(
        h,
        `Status ${status.label.toLowerCase()}, at every size: 20px, 24, 32, and 40, with its patch 7, 8, 9, and 10px`,
        markSizes.map((size) => mark(h, { text: "AM", size, status })),
        iconSizeRow
      )
    ),
    sample(
      h,
      "Lilac, the tone of an agent, with a status and without",
      [
        mark(h, { text: "A", tone: "lilac", size: "md" }),
        mark(h, { text: "A", tone: "lilac", size: "md", status: online }),
        mark(h, { text: "R", tone: "lilac", size: "md", status: needsSetup })
      ],
      iconSizeRow
    ),
    sample(
      h,
      "A status mark alone, 9px, for an item with no mark of its own, and the logo's mark of what is at work",
      [...markStatuses.map((status) => statusMark(h, status)), activityMark(h)],
      iconSizeRow
    ),
    sample(
      h,
      "A drawing in place of letters, for a thing with no name to abbreviate, by size, and with a status",
      [
        ...markSizes.map((size) => mark(h, { icon: "mark-connections", size })),
        mark(h, { icon: "mark-connections", size: "md", status: needsSetup }),
        mark(h, { icon: "mark-connections", size: "md", status: unavailable })
      ],
      iconSizeRow
    ),
    sample(
      h,
      "Sizes",
      [mark(h, { text: "AM", size: "xs" }), mark(h, { text: "AM", size: "sm" }), mark(h, { text: "AM", size: "md" })],
      iconSizeRow
    ),
    sample(
      h,
      "One letter",
      [mark(h, { text: "Y", size: "xs" }), mark(h, { text: "Y", size: "sm" }), mark(h, { text: "Y", size: "md" })],
      iconSizeRow
    ),
    sample(h, "Cluster of two, three, and seven", [
      markCluster(h, { marks: ["AM", "Y"], label: "2 members", onClick: Message.ClickedButton() }),
      markCluster(h, { marks: ["AM", "Y", "S"], label: "3 members", onClick: Message.ClickedButton() }),
      markCluster(h, {
        marks: ["AM", "Y", "S", "OK", "AJ", "KL", "RT"],
        label: "7 members",
        onClick: Message.ClickedButton()
      })
    ])
  ])

const openableThreads: ReadonlyArray<
  Readonly<{
    key: string
    mark: string
    author: string
    time: string
    text: string
    replies?: Readonly<{ marks: ReadonlyArray<string>; label: string }>
  }>
> = [
  {
    key: "preview-ready",
    mark: "AM",
    author: "Alex",
    time: "Yesterday",
    text: "The preview is ready for another look. I've linked the latest notes in the task."
  },
  { key: "deploy-clean", mark: "S", author: "Sara", time: "9:44 AM", text: "deploy went out clean last night!" },
  {
    key: "composer-paste-crash",
    mark: "AJ",
    author: "AJ",
    time: "10:02 AM",
    text: "found a bug. composer crashes when I paste an image from clipboard lol",
    replies: { marks: ["AM", "Y", "S"], label: "4 replies" }
  }
]

/** A text that opens with a mention, `name` as it shows, and goes on with `words`. */
const mentionRuns = (name: string, words: string): ReadonlyArray<TextRun> => [
  { text: name, isMention: true },
  { text: words }
]

const messageGroup = (h: ApplicationViewBuilder, openThread: string, editText: string): Html => {
  const press = Message.ClickedButton()

  return group(h, "Messages", [
    sample(
      h,
      "A list with a current row, whose text opens the thread",
      [
        messageList(h, {
          label: "Threads",
          children: openableThreads.map((thread) =>
            message(h, {
              key: thread.key,
              mark: thread.mark,
              author: thread.author,
              time: thread.time,
              text: thread.text,
              onOpen: Message.OpenedThread({ key: thread.key }),
              isCurrent: thread.key === openThread,
              ...(thread.replies === undefined ? {} : { meta: [replyLine(h, thread.replies)] })
            })
          )
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A note, actions at the end of the author line, and meta under the text",
      [
        messageList(h, {
          label: "Replies",
          children: [
            message(h, {
              key: "reproduced",
              mark: "Y",
              author: "Yumi",
              time: "10:05 AM",
              note: "edited",
              text: "Reproduced on both. Images over 5 MB hit the crash.",
              actions: [
                button(h, "Edit", press, { variant: "quiet" }),
                button(h, "Delete", press, { variant: "quiet" })
              ],
              meta: [h.span([], ["2 new"]), h.span([], ["Doing"])]
            }),
            message(h, {
              key: "sending",
              mark: "AJ",
              author: "AJ",
              note: "Sending…",
              text: "Thanks! I'll attach the image to the task."
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A mention in the text as a chip: in plain text, in a row that opens a thread, and in the current row",
      [
        messageList(h, {
          label: "Mentions",
          children: [
            message(h, {
              key: "plain-mention",
              mark: "G",
              author: "Graeme",
              time: "10:08 AM",
              text: mentionRuns("@Caleb", " Let's grab some coffee")
            }),
            message(h, {
              key: "openable-mention",
              mark: "S",
              author: "Sara",
              time: "10:12 AM",
              text: mentionRuns("@Jamie", " can you check the composer fix before we ship?"),
              onOpen: press
            }),
            message(h, {
              key: "current-mention",
              mark: "AJ",
              author: "AJ",
              time: "10:15 AM",
              text: [
                { text: "Thanks " },
                { text: "@Sara", isMention: true },
                { text: " and " },
                { text: "@Yumi", isMention: true },
                { text: ", both fixes are in." }
              ],
              onOpen: press,
              isCurrent: true
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A thread's replies under its row: one reply, three people, and more people than it shows",
      [
        messageList(h, {
          label: "Threads with replies",
          children: [
            message(h, {
              key: "one-reply",
              mark: "S",
              author: "Sara",
              time: "9:44 AM",
              text: "deploy went out clean last night!",
              onOpen: press,
              meta: [replyLine(h, { marks: ["O"], label: "1 reply" })]
            }),
            message(h, {
              key: "three-people",
              mark: "AJ",
              author: "AJ",
              time: "10:02 AM",
              text: "found a bug. composer crashes when I paste an image from clipboard lol",
              onOpen: press,
              meta: [replyLine(h, { marks: ["AM", "Y", "S"], label: "4 replies" })]
            }),
            message(h, {
              key: "many-people",
              mark: "G",
              author: "Graeme",
              time: "10:08 AM",
              text: "Can everyone look at the release notes before noon?",
              onOpen: press,
              meta: [replyLine(h, { marks: ["AM", "Y", "S", "O", "AJ"], label: "12 replies" }), h.span([], ["2 new"])]
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "Notifications under their days: unread, with a dot, and read",
      [
        messageList(h, {
          label: "Inbox",
          children: [
            divider(h, "Today"),
            notification(h, {
              key: "sara",
              mark: "S",
              author: "Sara",
              activity: "mentioned you",
              place: "#general",
              text: mentionRuns("@Jamie", " can you check the composer fix before we ship?"),
              age: "2m ago",
              isUnread: true,
              onOpen: press
            }),
            notification(h, {
              key: "alex",
              mark: "AM",
              author: "Alex",
              activity: "replied",
              place: "#engineering",
              text: "The retry now keeps the original request. Ready for another look.",
              age: "12m ago",
              isUnread: true,
              onOpen: press
            }),
            notification(h, {
              key: "oliver",
              mark: "O",
              author: "Oliver",
              activity: "replied",
              place: "#product",
              text: "The empty state copy is updated. I've attached the latest version.",
              age: "1h ago",
              onOpen: press
            }),
            divider(h, "Yesterday"),
            notification(h, {
              key: "caleb",
              mark: "C",
              author: "Caleb",
              activity: "mentioned you",
              place: "Caleb · Direct message",
              text: mentionRuns("@Jamie", " let's grab coffee after the rollout."),
              age: "Yesterday",
              onOpen: press
            }),
            notification(h, {
              key: "activity",
              mark: "?",
              author: "Activity",
              activity: "in a thread",
              place: "Unavailable thread",
              text: "You can no longer see this thread.",
              age: "Yesterday"
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "The current notification: the one whose thread is open, in its place among the others",
      [
        messageList(h, {
          label: "Inbox with a thread open",
          children: [
            divider(h, "Today"),
            notification(h, {
              key: "current-sara",
              mark: "S",
              author: "Sara",
              activity: "mentioned you",
              place: "#general",
              text: mentionRuns("@Jamie", " can you check the composer fix before we ship?"),
              age: "2m ago",
              isUnread: true,
              onOpen: press
            }),
            notification(h, {
              key: "current-alex",
              mark: "AM",
              author: "Alex",
              activity: "replied",
              place: "#engineering",
              text: "The retry now keeps the original request. Ready for another look.",
              age: "12m ago",
              onOpen: press,
              isCurrent: true
            }),
            notification(h, {
              key: "current-oliver",
              mark: "O",
              author: "Oliver",
              activity: "replied",
              place: "#product",
              text: "The empty state copy is updated. I've attached the latest version.",
              age: "1h ago",
              onOpen: press
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A list ended by a quiet button, centered: Show older",
      [
        messageList(h, {
          label: "Inbox paged",
          children: [
            divider(h, "Yesterday"),
            notification(h, {
              key: "paged-caleb",
              mark: "C",
              author: "Caleb",
              activity: "mentioned you",
              place: "Caleb · Direct message",
              text: mentionRuns("@Jamie", " let's grab coffee after the rollout."),
              age: "Yesterday",
              onOpen: press
            })
          ]
        }),
        buttonRow(h, [button(h, "Show older", press, { variant: "quiet" })], { isCentered: true })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A body in place of the text",
      [
        messageList(h, {
          label: "Editing",
          children: [
            message(h, {
              key: "editing",
              mark: "Y",
              author: "Yumi",
              time: "10:05 AM",
              text: editText,
              body: form(h, { onSubmit: press, label: "Edit message", variant: "pane" }, [
                textarea(h, {
                  id: "edit-message",
                  label: "Edit",
                  value: editText,
                  onInput: (value) => Message.TypedEdit({ value })
                }),
                buttonRow(h, [submit(h, "Save"), button(h, "Cancel", press, { variant: "quiet" })])
              ])
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A divider, centered and at the start",
      [
        messageList(h, {
          label: "Days",
          children: [
            divider(h, "Yesterday"),
            message(h, { key: "alex", mark: "AM", author: "Alex", time: "Yesterday", text: "Looks good." }),
            divider(h, "4 replies", { align: "start" }),
            message(h, { key: "sara", mark: "S", author: "Sara", time: "9:44 AM", text: "I can pick this up." })
          ]
        })
      ],
      conversationColumn
    )
  ])
}

const paneEmptyGroup = (h: ApplicationViewBuilder): Html => {
  const press = Message.ClickedButton()

  return group(h, "Empty pane", [
    sample(
      h,
      "A title and a line of copy, with an action in the header",
      [
        h.div(
          [h.Class(emptyPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Inbox",
              header: { title: "Inbox", icon: "mark-mail", actions: [button(h, "Mark all seen", press)] },
              body: [paneEmpty(h, { icon: "mark-done", title: "You're all caught up", copy: "Nothing new." })]
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "A title, a line of copy, and an action under it",
      [
        h.div(
          [h.Class(emptyPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Agents",
              header: { title: "Agents", icon: "mark-agents" },
              body: [
                paneEmpty(h, {
                  icon: "mark-agents",
                  title: "No agents yet",
                  copy: "Add an agent: a member that works on a harness and a model your connections give.",
                  action: button(h, "Add agent", press, { variant: "primary" })
                })
              ]
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "A title alone",
      [
        h.div(
          [h.Class(emptyPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Tasks",
              header: { title: "Tasks", icon: "mark-tasks" },
              body: [paneEmpty(h, { icon: "mark-tasks", title: "No tasks yet" })]
            })
          ]
        )
      ],
      "flex flex-col"
    )
  ])
}

const paneColumnGroup = (h: ApplicationViewBuilder, workspaceName: string): Html =>
  group(h, "Pane column", [
    sample(
      h,
      "Keeping its measure of 42.5rem, for what is read and filled in",
      [
        h.div(
          [h.Class(columnPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Settings",
              header: { title: "Settings", icon: "mark-settings" },
              body: [
                paneColumn(h, [
                  paneForm(h, { title: "Rename the workspace", onSubmit: Message.ClickedButton() }, [
                    field(
                      h,
                      {
                        id: "measured-column-name",
                        label: "Name",
                        type: "text",
                        value: workspaceName,
                        onInput: (value) => Message.TypedWorkspaceName({ value }),
                        isAutofocus: false
                      },
                      Option.none()
                    ),
                    buttonRow(h, [submit(h, "Save")])
                  ])
                ])
              ]
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "Wide, spanning the pane, for a list",
      [
        h.div(
          [h.Class(columnPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Groups",
              header: { title: "Groups", icon: "users" },
              body: [
                paneColumn(
                  h,
                  [
                    summary(h, { copy: "Groups in this workspace.", count: `${groupRows.length} groups` }),
                    columns(h, { label: "Group", cells: ["Visibility", "Members"] }),
                    groupList(h)
                  ],
                  { isWide: true }
                )
              ]
            })
          ]
        )
      ],
      "flex flex-col"
    )
  ])

const composerGroup = (h: ApplicationViewBuilder, draft: string, filledDraft: string): Html => {
  const press = Message.ClickedButton()

  return group(h, "Composer", [
    sample(
      h,
      "Empty",
      [
        composer(h, {
          id: "draft",
          label: "Start a thread",
          placeholder: "Message #general",
          value: draft,
          onInput: (value) => Message.TypedDraft({ value }),
          onSubmit: press,
          submitLabel: "Start"
        })
      ],
      composerColumn
    ),
    sample(
      h,
      "Filled",
      [
        composer(h, {
          id: "filled-draft",
          label: "Reply",
          placeholder: "Reply in thread",
          value: filledDraft,
          onInput: (value) => Message.TypedFilledDraft({ value }),
          onSubmit: press,
          submitLabel: "Reply"
        })
      ],
      composerColumn
    ),
    sample(
      h,
      "Mentioning a member, the second one active",
      [
        composer(h, {
          id: "mentioning-draft",
          label: "Reply",
          placeholder: "Reply in thread",
          value: "Can you look, @al",
          onInput: () => press,
          onSubmit: press,
          submitLabel: "Reply",
          suggestions: {
            id: "mentioning-members",
            items: [
              { id: "alex", mark: "AM", name: "Alex Morgan", isActive: false, onPick: press },
              { id: "alma", mark: "AI", name: "Alma Ito", isActive: true, onPick: press },
              { id: "alan", mark: "AT", name: "Alan Turing", isActive: false, onPick: press }
            ],
            onKeyDown: () => Option.none()
          }
        })
      ],
      mentioningColumn
    )
  ])
}

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
    search: { label: "Search", onClick: Message.ClickedButton() },
    footer: [toItem(railSettings)],
    account: { letter: "JM", label: "Account", onClick: Message.ClickedButton() }
  })
}

const workspaceHeader = (h: ApplicationViewBuilder): Html => {
  const press = Message.ClickedButton()

  return sidebarHeader(h, {
    mark: "M",
    name: "Mercier & Co",
    actions: [iconButton(h, { icon: "mark-menu", label: "Switch workspace", onClick: press })],
    search: { label: "Find anything…", shortcut: "⌘ K", onClick: press }
  })
}

const shellSidebar = (h: ApplicationViewBuilder, isThreadOpen: boolean, isDirectMessagesEmpty: boolean): Html => {
  const press = Message.ClickedButton()

  return sidebar(h, {
    label: "Workspace",
    header: workspaceHeader(h),
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
          onTitleClick: press,
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
            sidebarItem(h, { icon: "mark-channel", label: "engineering", isCurrent: false, onClick: press }),
            sidebarItem(h, { icon: "mark-channel", label: "launch", isPending: true, isCurrent: false, onClick: press })
          ]
        }),
        sidebarSection(h, {
          label: "Direct messages",
          actions: [iconButton(h, { icon: "mark-new", label: "New message", onClick: press }, { size: "compact" })],
          children: isDirectMessagesEmpty
            ? [sidebarEmpty(h, "No conversations yet")]
            : [
                sidebarItem(h, { mark: { text: "AM" }, label: "Alex Morgan", isCurrent: false, onClick: press }),
                sidebarItem(h, { mark: { text: "Y" }, label: "Yumi", isCurrent: false, onClick: press })
              ]
        })
      ])
    ],
    footer: sidebarFooter(h, [hint(h, "12 members · as Alex")])
  })
}

const destinationSidebar = (h: ApplicationViewBuilder, sections: ReadonlyArray<Html>): Html =>
  sidebar(h, {
    label: "Workspace",
    header: workspaceHeader(h),
    children: [sidebarSections(h, sections)],
    footer: sidebarFooter(h, [hint(h, "12 members · as Alex")])
  })

const agentsSidebar = (h: ApplicationViewBuilder, current: string | undefined): Html => {
  const press = Message.ClickedButton()

  return destinationSidebar(h, [
    sidebarSection(h, {
      label: "Agents",
      onTitleClick: press,
      isTitleCurrent: current === undefined,
      actions: [
        iconButton(h, { icon: "list", label: "Browse agents", onClick: press }, { size: "compact" }),
        iconButton(h, { icon: "mark-new", label: "Add agent", onClick: press }, { size: "compact" })
      ],
      children: agentSamples.map((agent) =>
        sidebarItem(h, {
          mark: { text: agent.name.slice(0, 1), tone: "lilac" },
          ...(agent.status === undefined ? {} : { status: agent.status }),
          ...(agent.activity === undefined ? {} : { activity: `${agent.activity.state} in ${agent.activity.place}` }),
          label: agent.name,
          isCurrent: agent.name === current,
          onClick: press
        })
      )
    })
  ])
}

const connectionSections: ReadonlyArray<
  Readonly<{ title: string; noun: string; entries: ReadonlyArray<Readonly<{ name: string; status?: MarkStatus }>> }>
> = [
  {
    title: "Models",
    noun: "model",
    entries: [
      { name: "Anthropic · Team" },
      { name: "Anthropic · Backup", status: needsSetup },
      { name: "OpenAI-compatible", status: unavailable }
    ]
  },
  { title: "Tools", noun: "tool", entries: [{ name: "GitHub" }] },
  { title: "Sandboxes", noun: "sandbox", entries: [{ name: "Remote development" }] },
  { title: "Harnesses", noun: "harness", entries: [] }
]

const connectionsSidebar = (h: ApplicationViewBuilder): Html => {
  const press = Message.ClickedButton()

  return destinationSidebar(h, [
    ...connectionSections.map(({ title, noun, entries }) =>
      sidebarSection(h, {
        label: title,
        onTitleClick: press,
        actions: [
          iconButton(h, { icon: "list", label: `Browse ${title.toLowerCase()}`, onClick: press }, { size: "compact" }),
          iconButton(h, { icon: "mark-new", label: `Add ${noun} connection`, onClick: press }, { size: "compact" })
        ],
        children:
          entries.length === 0
            ? [sidebarEmpty(h, "None yet")]
            : entries.map(({ name, status }) =>
                sidebarItem(h, {
                  icon: "mark-connections",
                  ...(status === undefined ? {} : { status }),
                  label: name,
                  isCurrent: false,
                  onClick: press
                })
              )
      })
    ),
    sidebarSection(h, {
      label: "Channels",
      onTitleClick: press,
      actions: [iconButton(h, { icon: "list", label: "Browse channels", onClick: press }, { size: "compact" })],
      children: []
    })
  ])
}

const agentsPane = (h: ApplicationViewBuilder, query: string): Html =>
  pane(h, {
    variant: "main",
    label: "Agents",
    header: {
      title: "Agents",
      icon: "mark-agents",
      actions: [button(h, "Add agent", Message.ClickedButton())],
      tabs: paneTabs(h, {
        label: "Agents",
        tabs: [
          { label: "All", count: agentSamples.length, isCurrent: true, onClick: Message.ClickedButton() },
          { label: "Needs setup", count: 1, isCurrent: false, onClick: Message.ClickedButton() }
        ]
      })
    },
    body: [
      paneColumn(
        h,
        [
          column(h, [
            field(
              h,
              {
                id: "workshop-agents-search",
                label: "Search agents",
                type: "search",
                value: query,
                onInput: (value) => Message.TypedAgentQuery({ value }),
                placeholder: "Search agents…",
                isAutofocus: false,
                isLabelHidden: true
              },
              Option.none()
            ),
            ...agentTable(h)
          ])
        ],
        { isWide: true }
      )
    ]
  })

const groupThreads = (h: ApplicationViewBuilder): Html => {
  const press = Message.ClickedButton()

  return messageList(h, {
    label: "Threads",
    children: [
      divider(h, "Yesterday"),
      message(h, {
        key: "preview-ready",
        mark: "AM",
        author: "Alex",
        time: "Yesterday",
        text: "The preview is ready for another look. I've linked the latest notes in the task.",
        onOpen: press
      }),
      message(h, {
        key: "release-morning",
        mark: "S",
        author: "Sara",
        time: "Yesterday",
        text: "Looks good. I'll keep an eye on the release this morning.",
        onOpen: press
      }),
      divider(h, "Today"),
      message(h, {
        key: "morning-all",
        mark: "O",
        author: "Oliver",
        time: "9:41 AM",
        text: "morning all! ☕",
        onOpen: press
      }),
      message(h, {
        key: "deploy-clean",
        mark: "S",
        author: "Sara",
        time: "9:44 AM",
        text: "deploy went out clean last night! 🎉",
        onOpen: press
      }),
      message(h, {
        key: "composer-paste-crash",
        mark: "AJ",
        author: "AJ",
        time: "10:02 AM",
        text: "found a bug. composer crashes when I paste an image from clipboard lol",
        onOpen: press,
        isCurrent: true,
        meta: [replyLine(h, { marks: ["AM", "Y", "S"], label: "4 replies" })]
      }),
      message(h, {
        key: "coffee",
        mark: "G",
        author: "Graeme",
        time: "10:08 AM",
        text: "@Caleb Let's grab some coffee",
        onOpen: press
      })
    ]
  })
}

const groupPane = (h: ApplicationViewBuilder, paneTab: PaneTab, composerText: string): Html => {
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
        ? groupThreads(h)
        : labelledLines(h, [
            ["Composer paste crash", "AND-214 · In progress"],
            ["Retry keeps the original request", "AND-209 · Ready for another look"]
          ])
    ],
    footer: [
      composer(h, {
        id: "composer",
        label: "Start a thread",
        placeholder: "Message #general",
        value: composerText,
        onInput: (value) => Message.TypedComposer({ value }),
        onSubmit: press,
        submitLabel: "Start"
      })
    ]
  })
}

const threadPane = (h: ApplicationViewBuilder, reply: string): Html => {
  const press = Message.ClickedButton()

  return pane(h, {
    variant: "side",
    label: "Composer paste crash",
    header: {
      title: "Composer paste crash",
      icon: "message",
      subtitle: "Thread in #general",
      leading: paneBack(h, press),
      actions: [paneClose(h, press)]
    },
    body: [
      messageList(h, {
        label: "Messages",
        children: [
          message(h, {
            key: "composer-paste-crash",
            mark: "AJ",
            author: "AJ",
            time: "10:02 AM",
            text: "found a bug. composer crashes when I paste an image from clipboard lol"
          }),
          divider(h, "4 replies", { align: "start" }),
          message(h, {
            key: "repro",
            mark: "AM",
            author: "Alex",
            time: "10:03 AM",
            text: "uh oh — repro on mac or everywhere?"
          }),
          message(h, {
            key: "reproduced",
            mark: "Y",
            author: "Yumi",
            time: "10:05 AM",
            text: "Reproduced on both — images over 5 MB hit the crash. Filed it and tagged the composer team."
          }),
          message(h, {
            key: "attach",
            mark: "AJ",
            author: "AJ",
            time: "10:07 AM",
            text: "Thanks! I'll attach the image to the task."
          }),
          message(h, {
            key: "pick-up",
            mark: "S",
            author: "Sara",
            time: "10:09 AM",
            text: "I can pick this up after the release check."
          })
        ]
      })
    ],
    footer: [
      composer(h, {
        id: "reply",
        label: "Reply",
        placeholder: "Reply in thread",
        value: reply,
        onInput: (value) => Message.TypedReply({ value }),
        onSubmit: press,
        submitLabel: "Reply"
      })
    ]
  })
}

const agentPane = (h: ApplicationViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Yumi",
    header: { title: "Yumi", mark: { text: "Y", tone: "lilac" }, status: needsSetup, phoneContext: "Mercier & Co" },
    body: [
      paneColumn(h, [
        noticeBox(h, {
          title: "This agent can't run as it is set up",
          lines: ["Its model connection was removed.", "Its harness works only in a sandbox, and it has none."]
        }),
        form(h, { onSubmit: Message.ClickedButton(), label: "Name", variant: "pane" }, [
          field(
            h,
            {
              id: "agent-name",
              label: "Agent name",
              type: "text",
              value: "Yumi",
              onInput: () => Message.ClickedButton(),
              isAutofocus: false
            },
            Option.none()
          ),
          buttonRow(h, [submit(h, "Save name", { variant: "secondary", isDisabled: true })])
        ]),
        paneForm(h, { title: "Setup", onSubmit: Message.ClickedButton(), hasStitch: true }, [
          textarea(h, {
            id: "agent-instructions",
            label: "Instructions",
            value: "Read the repository, and file what you find as tasks.",
            rows: 6,
            hint: "What the agent works by: its role, how it answers, and what to avoid.",
            onInput: () => Message.ClickedButton()
          }),
          buttonRow(h, [submit(h, "Save setup", { isDisabled: true })])
        ]),
        paneSection(h, {
          title: "Details",
          hasStitch: true,
          children: [
            detailList(h, [
              { label: "Role", value: "Changed in Settings › Members, as any member's is." },
              { label: "Current activity", value: "Idle" },
              { label: "Created by", value: "Alex Morgan · 6 Oct 2026" }
            ])
          ]
        }),
        paneSection(h, {
          title: "Removal",
          hasStitch: true,
          children: [
            hint(h, "Removing this agent ends its membership. Its messages stay in their threads."),
            buttonRow(h, [button(h, "Remove agent", Message.ClickedButton())])
          ]
        })
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

const joinedConfirmation = (h: ApplicationViewBuilder): Html =>
  toast(h, {
    text: "Joined Northstar Studio",
    role: "status",
    action: { label: "Dismiss", onClick: Message.ClickedButton() }
  })

const logLines: ReadonlyArray<string> = [
  "Read 2 messages",
  "Replied: Reproduced on both. Images over 5 MB hit the crash.",
  "Stopped short: The model was unavailable."
]

const longLogLines: ReadonlyArray<string> = Array.from(
  { length: 24 },
  (_, index) => `Read ${index + 1} ${index === 0 ? "message" : "messages"}`
)

const turnEntries = (h: ApplicationViewBuilder): ReadonlyArray<Html> => {
  const press = Message.ClickedButton()

  return [
    entry(h, {
      key: "scout",
      mark: "SC",
      title: "Scout",
      trailing: [badge(h, { label: "Running", tone: "caution" }), hint(h, "run again by Bob"), sending(h, true)],
      children: [
        buttonRow(h, [
          button(h, "Stop", press, { variant: "quiet" }),
          button(h, "Show log", press, { variant: "quiet" })
        ])
      ]
    }),
    entry(h, {
      key: "yumi",
      mark: "Y",
      title: "Yumi",
      trailing: [badge(h, { label: "Failed", tone: "danger" })],
      children: [
        notice(h, Option.some("The model was unavailable.")),
        buttonRow(h, [
          button(h, "Run again", press, { variant: "quiet" }),
          button(h, "Hide log", press, { variant: "quiet" })
        ]),
        log(h, { label: "Log", items: logLines }),
        hint(h, "The turn has ended.")
      ]
    }),
    entry(h, {
      key: "alex",
      mark: "AM",
      title: "Alex Morgan",
      trailing: [badge(h, { label: "Completed", tone: "success" })]
    }),
    entry(h, { key: "sara", mark: "S", title: "Sara", trailing: [badge(h, { label: "Queued" })] })
  ]
}

const detailsGroup = (
  h: ApplicationViewBuilder,
  model: Readonly<{
    workspaceName: string
    taskStatus: TaskStatus
    taskPriority: TaskPriority
    taskAssignee: TaskAssignee
  }>
): Html =>
  group(h, "Details", [
    sample(
      h,
      "Detail list",
      [
        detailList(h, [
          { label: "Status", value: "Triage" },
          { label: "Priority", value: "No priority" },
          { label: "Assignee", value: "No one" }
        ])
      ],
      sidePaneColumn
    ),
    sample(
      h,
      "Badge tones",
      [
        badge(h, { label: "Queued" }),
        badge(h, { label: "Completed", tone: "success" }),
        badge(h, { label: "Running", tone: "caution" }),
        badge(h, { label: "Failed", tone: "danger" })
      ],
      sampleRow
    ),
    sample(
      h,
      "Entries with marks, trailing badges, and children",
      [entryList(h, { label: "Turns", children: turnEntries(h) })],
      sidePaneColumn
    ),
    sample(
      h,
      "Entries without marks",
      [
        entryList(h, {
          label: "Members",
          children: [
            entry(h, { key: "alex", title: "Alex Morgan", trailing: [badge(h, { label: "Owner" })] }),
            entry(h, { key: "yumi", title: "Yumi", trailing: [badge(h, { label: "Agent" })] }),
            entry(h, { key: "sara", title: "Sara" })
          ]
        })
      ],
      sidePaneColumn
    ),
    sample(
      h,
      "Entries that open something, the second one active",
      [
        entryList(h, {
          label: "Found",
          children: [
            entry(h, { key: "found-design", mark: "#", title: "Design crew", onClick: Message.ClickedButton() }),
            entry(h, {
              key: "found-plans",
              title: "Plans for the week",
              trailing: [badge(h, { label: "Design crew" })],
              onClick: Message.ClickedButton(),
              isActive: true
            }),
            entry(h, { key: "found-yumi", mark: "Y", title: "Yumi", onClick: Message.ClickedButton() })
          ]
        })
      ],
      sidePaneColumn
    ),
    sample(h, "Log", [log(h, { label: "Log", items: logLines })], sidePaneColumn),
    sample(h, "Log, scrolling past 15rem", [log(h, { label: "Long log", items: longLogLines })], sidePaneColumn),
    sample(
      h,
      "Pane sections: a task to change, a task to read, and the turns",
      [
        paneColumn(h, [
          paneSection(h, {
            title: "Task",
            trailing: [sending(h, true)],
            children: [notice(h, Option.some("You may not change this task.")), taskFields(h, model, "section")]
          }),
          paneSection(h, {
            title: "Task",
            children: [
              detailList(h, [
                { label: "Status", value: "Triage" },
                { label: "Priority", value: "No priority" },
                { label: "Assignee", value: "No one" }
              ])
            ]
          }),
          paneSection(h, {
            title: "Turns",
            children: [entryList(h, { label: "Turns in a section", children: turnEntries(h).slice(0, 2) })]
          })
        ])
      ],
      sidePaneColumn
    ),
    sample(
      h,
      "Pane form: a section that is one form",
      [
        paneColumn(h, [
          paneForm(h, { title: "Rename the workspace", onSubmit: Message.ClickedButton() }, [
            field(
              h,
              {
                id: "pane-form-name",
                label: "Name",
                type: "text",
                value: model.workspaceName,
                onInput: (value) => Message.TypedWorkspaceName({ value }),
                isAutofocus: false
              },
              Option.none()
            ),
            buttonRow(h, [submit(h, "Save"), button(h, "Cancel", Message.ClickedButton(), { variant: "quiet" })])
          ])
        ])
      ],
      sidePaneColumn
    )
  ])

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
      "A confirmation, a status and not an alert",
      [h.div([h.Class(toastFrame)], [toastStack(h, [joinedConfirmation(h)])])],
      "flex flex-col"
    ),
    sample(
      h,
      "A stack of two",
      [h.div([h.Class(toastFrame)], [toastStack(h, [renameRefusal(h), postRefusal(h)])])],
      "flex flex-col"
    )
  ])

const groupNameField = (h: ApplicationViewBuilder, id: string, model: Model, render: RenderInfo): Html =>
  field(
    h,
    {
      id,
      label: "Group name",
      type: "text",
      value: model.groupName,
      onInput: (value) => Message.TypedGroupName({ value }),
      isAutofocus: false,
      attributes: render.initialFocus
    },
    Option.none()
  )

const groupPrivateToggle = (h: ApplicationViewBuilder, id: string, model: Model): Html =>
  toggle(h, {
    id,
    label: "Only invited members can join",
    isOn: model.isGroupPrivate,
    onToggle: (isOn) => Message.ToggledGroupPrivate({ isOn })
  })

const groupMembers = (h: ApplicationViewBuilder): Html =>
  entryList(h, {
    label: "Members",
    children: [
      entry(h, {
        key: "alex",
        mark: "AM",
        title: "Alex Morgan",
        trailing: [badge(h, { label: "Admin", tone: "success" })]
      }),
      entry(h, { key: "yumi", mark: "Y", title: "Yumi", trailing: [hint(h, "Joined yesterday")] }),
      entry(h, { key: "sara", mark: "S", title: "Sara" })
    ]
  })

const renameModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html =>
  modal(h, render, {
    title: "Rename group",
    context: "# general",
    body: [groupNameField(h, "modal-group-name", model, render), groupPrivateToggle(h, "modal-group-private", model)],
    cancelLabel: "Cancel",
    footer: [submit(h, "Save changes")],
    onSubmit: Message.SubmittedModal()
  })

const settingsModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html =>
  modal(h, render, {
    title: "Group settings",
    context: "# general",
    description: "Changes apply to everyone in the group.",
    tabs: paneTabs(h, {
      label: "Group settings",
      tabs: [
        {
          label: "General",
          isCurrent: model.modalTab === "general",
          onClick: Message.ChangedModalTab({ tab: "general" })
        },
        {
          label: "Members",
          count: 7,
          isCurrent: model.modalTab === "members",
          onClick: Message.ChangedModalTab({ tab: "members" })
        }
      ]
    }),
    body:
      model.modalTab === "general"
        ? [
            groupNameField(h, "wide-modal-group-name", model, render),
            groupPrivateToggle(h, "wide-modal-group-private", model)
          ]
        : [groupMembers(h)],
    cancelLabel: "Cancel",
    footer: [submit(h, "Save changes")],
    onSubmit: Message.SubmittedWideModal(),
    width: "wide"
  })

const modalGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  group(h, "Modal", [
    sample(h, "A context, a field with the initial focus, a toggle, and a footer", [
      button(h, "Open the modal", Message.ClickedOpenModal()),
      h.block(
        ModalBinding.embedView({
          slotId: "modal",
          model: model.modal,
          viewInputs: { toView: (render) => renameModal(h, render, model) }
        })
      )
    ]),
    sample(h, "Wide, with tabs and a description", [
      button(h, "Open the wide modal", Message.ClickedOpenWideModal()),
      h.block(
        WideModalBinding.embedView({
          slotId: "wide-modal",
          model: model.wideModal,
          viewInputs: { hasDescription: true, toView: (render) => settingsModal(h, render, model) }
        })
      )
    ])
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
              viewport: "Split",
              rail: shellRail(h, model.destination),
              sidebar: shellSidebar(h, true, false),
              main: groupPane(h, model.paneTab, model.composer),
              aside: { view: threadPane(h, model.reply), isOpen: false, dialog: () => h.empty }
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "Without the side pane: an agent's page, with its mark and status in the header and sections set apart by a stitch, and notices",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              viewport: "Split",
              rail: shellRail(h, model.destination),
              sidebar: shellSidebar(h, false, true),
              main: agentPane(h),
              notices: toastStack(h, [renameRefusal(h), postRefusal(h)])
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "Agents: the rail on Agents and the Search item, the sidebar's title current with each agent's status and the logo at those at work, and the list",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              viewport: "Split",
              rail: shellRail(h, "agents"),
              sidebar: agentsSidebar(h, undefined),
              main: agentsPane(h, model.agentQuery)
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "Agents with one open: its row current, and its patch cut out of the row's own surface",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              viewport: "Split",
              rail: shellRail(h, "agents"),
              sidebar: agentsSidebar(h, "Review helper"),
              main: agentPane(h)
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "Connections: a section for each capability, with a status mark at the end of those that need one, a quiet line for none, and a last section that is its heading and Browse alone",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              viewport: "Split",
              rail: shellRail(h, "connections"),
              sidebar: connectionsSidebar(h),
              main: pane(h, {
                variant: "main",
                label: "Connections",
                header: { title: "Connections", icon: "mark-connections" },
                body: []
              })
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
          modalGroup(h, model),
          iconGroup(h),
          markGroup(h),
          detailsGroup(h, model),
          messageGroup(h, model.openThread, model.editText),
          paneEmptyGroup(h),
          composerGroup(h, model.draft, model.filledDraft),
          formGroup(h, model.taskStatus),
          directoryGroup(h),
          centeredGroup(h, model.signInEmail, model.code)
        ]
      ),
      h.div(
        [h.Class(wideColumn)],
        [directoryTableGroup(h), paneColumnGroup(h, model.workspaceName), shellGroup(h, model)]
      )
    ]
  )
}))

export const directoryTableView = ApplicationComposition.makeView((_model, h) => ({
  title: "amends design workshop: directory table",
  body: h.div([h.Class(tableFrameBody)], groupTable(h))
}))

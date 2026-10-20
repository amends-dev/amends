import type { RenderInfo } from "@foldkit/ui/dialog"
import type { ViewInputs } from "@foldkit/ui/menu"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { centered, centeredAccount, copy, heading, screenContent } from "../src/centered.ts"
import { composer } from "../src/composer.ts"
import {
  announcement,
  answerKeys,
  button,
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
  link,
  linkButton,
  loadingLine,
  notice,
  noticeBox,
  searchField,
  sending,
  submit,
  textarea,
  toggle
} from "../src/control.ts"
import {
  activityList,
  badge,
  detailList,
  entry,
  entryList,
  log,
  person,
  properties,
  property,
  propertyIcon,
  propertyValue,
  type TurnState,
  turnStatus
} from "../src/details.ts"
import {
  activityCell,
  cellWithDetail,
  columns,
  emptyLine,
  footnote,
  historyRow,
  loadingRows,
  row,
  rowWithButton,
  section,
  statusLine,
  summary
} from "../src/directory.ts"
import { form, inline, settingRow, valueWithAction } from "../src/form.ts"
import { type IconName, icon } from "../src/icon.ts"
import { type LogoMotion, logo, logoMotions } from "../src/logo.ts"
import {
  activityMark,
  type MarkContent,
  type MarkSize,
  type MarkStatus,
  mark,
  markStack,
  statusMark,
  statusTooltip,
  type TaskStatusShape,
  taskStatus,
  taskStatusShapes
} from "../src/mark.ts"
import {
  type GroupMember,
  memberCount,
  memberList as groupMemberList,
  memberPicker,
  memberPickerList,
  type PickerPerson
} from "../src/members.ts"
import {
  type ChoiceMenuChoice,
  choiceMenu,
  type MenuGroup,
  menu,
  type PropertyChoice,
  propertyMenu
} from "../src/menu.ts"
import {
  description,
  divider,
  event,
  message,
  messageList,
  type MessageText,
  note,
  notification,
  repliesButton,
  replyInThreadButton,
  taskChip,
  type ThreadWork,
  turnLog,
  turnRow
} from "../src/message.ts"
import { type ModalRender, modal, modalList } from "../src/modal.ts"
import { palette, type PaletteItem, type PaletteSection } from "../src/palette.ts"
import {
  pane,
  paneBack,
  paneClose,
  paneColumn,
  paneEmpty,
  paneForm,
  paneSection,
  paneStack,
  paneTabs,
  paneToolbar
} from "../src/pane.ts"
import { rail, railAccount } from "../src/rail.ts"
import { richText } from "../src/richText.ts"
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
import { type StateArtKind, stateArt, stateArtKinds } from "../src/stateArt.ts"
import { taskHeadings, taskList, taskListEmpty, type TaskListRow } from "../src/taskList.ts"
import { confirmation, confirmationStack, toast, toastStack } from "../src/toast.ts"
import { tooltip } from "../src/tooltip.ts"
import {
  AccountBinding,
  AddPickerBinding,
  AddViewModalBinding,
  type ApplicationViewBuilder,
  ApplicationComposition,
  AssigneeFilterBinding,
  ChooserModalBinding,
  ChosenPickerBinding,
  FormModalBinding,
  CompactModalBinding,
  ConfirmModalBinding,
  CreateModalBinding,
  CreatePickerBinding,
  CreateVisibilityBinding,
  EmptyPickerBinding,
  LockedVisibilityBinding,
  MemberFilterBinding,
  MembersPaneFilterBinding,
  ModalBinding,
  RailAccountBinding,
  TaskAssigneeBinding,
  TaskFilterBinding,
  TaskPriorityBinding,
  TaskSortBinding,
  TaskStatusBinding,
  ToolbarFilterBinding,
  ToolbarSortBinding,
  VisibilityBinding,
  PaletteModalBinding,
  SettingsModalBinding,
  WideModalBinding
} from "./composition.ts"
import {
  type AccountEntry,
  type Appearance,
  type AssigneeFilter,
  type Destination,
  Message,
  type MemberFilter,
  type Model,
  type PaneTab,
  type Plan,
  type TaskAssignee,
  type TaskFilter,
  type TaskPriority,
  type TaskSort,
  type TaskStatus,
  type Visibility
} from "./definition.ts"

/** What a dialog publishes to a modal that the workshop's builder draws. */
type ApplicationModalRender =
  ApplicationViewBuilder extends HtmlBuilder<infer Universe, infer Requirements>
    ? ModalRender<Universe, Requirements>
    : never

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

const richTextColumn = "flex max-w-xl flex-col px-3 text-body text-ink"

const richTextNarrowColumn = "flex w-72 max-w-full flex-col p-3 text-body text-ink outline outline-outline"

const richTextPreview = "m-0 max-w-xl px-3 text-body text-ink-secondary"

const composerColumn = "flex max-w-md flex-col"

const mentioningColumn = "flex max-w-md flex-col pt-24"

const toolbarPaneFrame = "flex h-120 flex-col outline outline-outline"

const phoneWindowFrame = "h-160 w-90 max-w-full flex-none outline outline-outline"

const touchWindowFrame = "h-160 w-208 max-w-full flex-none outline outline-outline"

const desktopWindowFrame = "h-160 w-264 max-w-full flex-none outline outline-outline"

const taskListColumn = "flex max-w-5xl flex-col"

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
  ["doing", "Doing"],
  ["held", "Held"],
  ["done", "Done"],
  ["dismissed", "Dismissed"]
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
    sample(h, "Link in the look of a button, to the address of the page itself, which loads it again", [
      linkButton(h, { label: "Reload", href: "" }, { variant: "primary" }),
      linkButton(h, { label: "Reload", href: "" }),
      linkButton(h, { label: "Reload", href: "" }, { variant: "primary", size: "large" })
    ]),
    sample(h, "Icon buttons, regular and compact", [
      iconButton(h, { icon: "mark-settings", label: "Settings", onClick: press }),
      iconButton(h, { icon: "mark-new", label: "New", onClick: press }, { size: "compact" })
    ]),
    sample(h, "Icon buttons as a switch, off and pressed", [
      iconButton(h, { icon: "bell", label: "Follow", onClick: press }, { isPressed: false }),
      iconButton(h, { icon: "bell-filled", label: "Following", onClick: press }, { isPressed: true })
    ]),
    sample(h, "Icon buttons, disabled, as a switch off and pressed too", [
      iconButton(h, { icon: "mark-settings", label: "Settings", onClick: press }, { isDisabled: true }),
      iconButton(h, { icon: "bell", label: "Follow", onClick: press }, { isPressed: false, isDisabled: true }),
      iconButton(h, { icon: "bell-filled", label: "Following", onClick: press }, { isPressed: true, isDisabled: true })
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

const codeScreen = (h: ApplicationViewBuilder, code: string, news: Option.Option<string>): Html =>
  centered(h, {
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
          codeInput(
            h,
            {
              id: "screen-code",
              label: "Verification code",
              value: code,
              onInput: (value) => Message.TypedCode({ value }),
              isAutofocus: false
            },
            Option.none()
          ),
          hint(h, "Use your most recent code."),
          submit(h, "Verify code", { size: "large", wide: true }),
          announcement(h, news),
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
            mark: { text: name.slice(0, 1) },
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

const groupColumns = (h: ApplicationViewBuilder): Html =>
  columns(h, { label: "Group", cells: ["Visibility", "Members"] })

const publicGroupRows: ReadonlyArray<Readonly<{ name: string; members: number; isJoining: boolean }>> = [
  { name: "launches", members: 8, isJoining: false },
  { name: "announcements", members: 24, isJoining: true }
]

const publicGroupList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [h.AriaLabel("Public groups")],
    publicGroupRows.map(({ name, members, isJoining }) =>
      h.keyed("li")(
        name,
        [],
        [
          row(h, {
            mark: { icon: "mark-channel" },
            title: name,
            cells: [badge(h, { label: "Public" }), h.span([], [`${members} members`])],
            cellsText: `Public · ${members} members`,
            button: {
              label: "Join",
              name: `Join #${name}`,
              isDisabled: isJoining,
              onClick: Message.ClickedButton()
            },
            onClick: Message.ClickedButton()
          })
        ]
      )
    )
  )

const publicGroupTable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  summary(h, {
    copy: "Public groups you haven't joined. Join one to read its threads.",
    count: `${publicGroupRows.length} groups`
  }),
  groupColumns(h),
  publicGroupList(h)
]

type MemberSample = Readonly<{ name: string; role: string; status: string; isAgent: boolean; isOpen: boolean }>

const memberSamples: ReadonlyArray<MemberSample> = [
  { name: "Jamie Morgan · You", role: "Owner", status: "Active", isAgent: false, isOpen: false },
  { name: "Alex Morgan", role: "Member", status: "Active", isAgent: false, isOpen: true },
  { name: "Sara", role: "Administrator", status: "Active", isAgent: false, isOpen: false },
  { name: "Yumi", role: "Member", status: "Active", isAgent: true, isOpen: false }
]

const memberColumns = (h: ApplicationViewBuilder): Html =>
  columns(h, { label: "Member", cells: ["Workspace role", "Status"] })

const memberList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [h.AriaLabel("Members")],
    memberSamples.map(({ name, role, status, isAgent, isOpen }) =>
      h.keyed("li")(
        name,
        [],
        [
          row(h, {
            mark: { text: name.slice(0, 1), tone: isAgent ? "lilac" : "neutral" },
            markSize: "md",
            isCompact: true,
            title: name,
            ...(isAgent ? { meta: "Agent" } : {}),
            cells: [h.span([], [role]), h.span([], [status])],
            cellsText: `${role} · ${status}`,
            isCurrent: isOpen,
            onClick: Message.ClickedButton()
          })
        ]
      )
    )
  )

const memberTable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [memberColumns(h), memberList(h)]

type InvitationSample = Readonly<{ recipient: string; detail: string; isSending?: boolean }>

const pendingInvitations: ReadonlyArray<InvitationSample> = [
  { recipient: "casey@mercier.example", detail: "Member · Expires in 5 days" },
  { recipient: "taylor@mercier.example", detail: "Administrator · Expires in 6 days" },
  { recipient: "dana@mercier.example", detail: "Member · Expires in 7 days · Sending…", isSending: true }
]

const pendingInvitationList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [h.AriaLabel("Pending invitations")],
    pendingInvitations.map(({ recipient, detail, isSending }) =>
      h.keyed("li")(
        recipient,
        [],
        [
          rowWithButton(h, {
            mark: { icon: "mark-mail" },
            markSize: "md",
            title: recipient,
            meta: detail,
            action: "Revoke",
            actionName: `Revoke invitation for ${recipient}`,
            isDisabled: isSending === true,
            variant: "quiet",
            onClick: Message.ClickedButton()
          })
        ]
      )
    )
  )

type HistorySample = Readonly<{
  recipient: string
  detail: string
  status: string
  isRevocable?: boolean
  isSending?: boolean
}>

const historySamples: ReadonlyArray<HistorySample> = [
  { recipient: "casey@mercier.example", detail: "Member · Expires in 5 days", status: "Pending", isRevocable: true },
  {
    recipient: "taylor@mercier.example",
    detail: "Administrator · Expires in 6 days · Sending…",
    status: "Pending",
    isRevocable: true,
    isSending: true
  },
  { recipient: "caleb@mercier.example", detail: "Member · Created Sep 21", status: "Accepted" },
  { recipient: "morgan@mercier.example", detail: "Member · Expired Oct 2", status: "Expired" },
  { recipient: "riley@mercier.example", detail: "Member · Created Sep 27", status: "Revoked" }
]

const invitationHistoryList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [h.AriaLabel("Invitation history")],
    historySamples.map(({ recipient, detail, status, isRevocable, isSending }) =>
      h.keyed("li")(
        recipient,
        [],
        [
          historyRow(h, {
            title: recipient,
            detail,
            status,
            ...(isRevocable === true
              ? {
                  action: {
                    label: "Revoke",
                    name: `Revoke invitation for ${recipient}`,
                    isDisabled: isSending === true,
                    onClick: Message.ClickedButton()
                  }
                }
              : {})
          })
        ]
      )
    )
  )

type AgentSample = Readonly<{
  name: string
  status?: MarkStatus
  harness: string
  sandbox: string
  model: string
  connection: string
  activity?: Readonly<{ state: string; motion: LogoMotion; place: string }>
}>

const agentSamples: ReadonlyArray<AgentSample> = [
  {
    name: "Atlas",
    status: { kind: "available", label: "Queued in #design" },
    harness: "Claude Code",
    sandbox: "Remote development",
    model: "Claude Sonnet 5",
    connection: "Anthropic · Team",
    activity: { state: "Queued", motion: "thread", place: "#design" }
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
    activity: { state: "Working", motion: "working", place: "#general" }
  },
  {
    name: "Planner",
    status: { kind: "available", label: "Stopping in Jamie Morgan" },
    harness: "Auto",
    sandbox: "No sandbox",
    model: "Claude Sonnet 5",
    connection: "Anthropic · Team",
    activity: { state: "Stopping", motion: "tug", place: "Jamie Morgan" }
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

const agentColumns = (h: ApplicationViewBuilder): Html =>
  columns(h, { label: "Agent", cells: ["Harness", "Model", "Activity"] })

const agentList = (h: ApplicationViewBuilder): Html =>
  h.ul(
    [h.AriaLabel("Agents")],
    agentSamples.map((agent) => agentRow(h, agent))
  )

const agentTable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [agentColumns(h), agentList(h)]

const directoryScreen = (h: ApplicationViewBuilder, children: ReadonlyArray<Html>): Html =>
  centered(h, {
    actions: [centeredAccount(h, "alex@mercier.example"), button(h, "Sign out", Message.ClickedButton())],
    width: "directory",
    children: [screenContent(h, children)]
  })

const formScreen = (h: ApplicationViewBuilder, children: ReadonlyArray<Html>): Html =>
  centered(h, {
    actions: [centeredAccount(h, "alex@mercier.example"), button(h, "Sign out", Message.ClickedButton())],
    width: "form",
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
    art: "sew-in",
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

const checkingSession = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  paneEmpty(h, {
    art: "working",
    title: "Checking your session",
    copy: "Connecting to your workspace host…",
    level: 1
  })
]

const hostUnreachable = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  paneEmpty(h, {
    art: "lost-thread",
    title: "Can't reach your workspace host",
    copy: "You're still signed in. Try again once the host is running.",
    action: button(h, "Try again", Message.ClickedButton(), { variant: "primary" }),
    level: 1
  })
]

const nothingAtThisAddress = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  paneEmpty(h, {
    art: "nothing-here",
    title: "Nothing at this address",
    copy: "This page doesn't exist. Check the link, or start again from your workspaces.",
    action: button(h, "Your workspaces", Message.ClickedButton(), { variant: "primary" }),
    level: 1
  })
]

const somethingWentWrong = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  paneEmpty(h, {
    art: "came-apart",
    title: "Something went wrong",
    copy: "amends stopped on an unexpected error. Reloading usually fixes it.",
    action: linkButton(h, { label: "Reload", href: "" }, { variant: "primary" }),
    level: 1
  })
]

/** The screen after a crash, outside the session, so the header holds the brand alone. */
const crashScreen = (h: ApplicationViewBuilder): Html =>
  centered(h, { width: "form", children: [screenContent(h, somethingWentWrong(h))] })

const workspaceClosedToYou = (h: ApplicationViewBuilder): ReadonlyArray<Html> => [
  paneEmpty(h, {
    art: "held-back",
    title: "That workspace is closed to you",
    copy: "This workspace doesn't exist, or it hasn't been shared with alex@mercier.example. Ask a member to invite this address.",
    action: button(h, "Your workspaces", Message.ClickedButton()),
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
      "Rows of public groups to join: the channel drawing, a Join button over the end of each row named for its group, the second disabled while it is on its way",
      publicGroupTable(h),
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Row with a button and no cells, which keeps 5rem at its end for it",
      [
        row(h, {
          mark: { icon: "mark-channel" },
          title: "a-group-with-a-title-long-enough-to-be-cut-short-before-the-join-button-that-lies-over-the-end",
          button: { label: "Join", name: "Join #launches", onClick: Message.ClickedButton() },
          onClick: Message.ClickedButton()
        })
      ],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "A quiet line where the list holds no rows, under the labels of its columns",
      [groupColumns(h), emptyLine(h, "No groups match this search.")],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "The same line while the list is read, in a live region",
      [groupColumns(h), statusLine(h, { text: "Loading groups…" })],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "The same line when the list could not be read, with a quiet Try again after the words",
      [
        groupColumns(h),
        statusLine(h, {
          text: "Can't load the groups.",
          action: button(h, "Try again", Message.ClickedButton(), { variant: "quiet" })
        })
      ],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Table of members: 32px marks in rows 56px tall, the second the member open beside the list (filled, with the bar), an agent's lilac mark with Agent under its name, and the role and status as cells",
      memberTable(h),
      "flex max-w-3xl flex-col"
    ),
    sample(
      h,
      "Section with an action after its line, over rows with a quiet button, each on a drawing of a mail",
      [
        section(h, {
          label: "Pending invitations",
          count: pendingInvitations.length,
          action: button(h, "View history", Message.ClickedButton(), { variant: "quiet" })
        }),
        pendingInvitationList(h)
      ],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "History of invitations: the address over what it gives, the status in words beside them, and a quiet Revoke at the end of a pending one, disabled while it is on its way",
      [invitationHistoryList(h)],
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
    sample(
      h,
      "Form width, code step",
      [h.div([h.Class(screenFrame)], [codeScreen(h, code, Option.none())])],
      "flex flex-col"
    ),
    sample(
      h,
      "Form width, code step after a new code was sent",
      [h.div([h.Class(screenFrame)], [codeScreen(h, code, Option.some("We sent a new code. Use the latest one."))])],
      "flex flex-col"
    ),
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
      "Form width, while the session is checked against the host: the logo working, in a live region, and the message is the screen's h1",
      [h.div([h.Class(screenFrame)], [formScreen(h, checkingSession(h))])],
      "flex flex-col"
    ),
    sample(
      h,
      "Form width, with the host not reached",
      [h.div([h.Class(screenFrame)], [formScreen(h, hostUnreachable(h))])],
      "flex flex-col"
    ),
    sample(
      h,
      "Form width, at an address that matches no page",
      [h.div([h.Class(screenFrame)], [formScreen(h, nothingAtThisAddress(h))])],
      "flex flex-col"
    ),
    sample(
      h,
      "Form width, after an unexpected error, outside the session: the brand alone in the header, and Reload a link to the page itself",
      [h.div([h.Class(screenFrame)], [crashScreen(h)])],
      "flex flex-col"
    ),
    sample(
      h,
      "Form width, at a workspace that is closed to the person",
      [h.div([h.Class(screenFrame)], [formScreen(h, workspaceClosedToYou(h))])],
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

const markSizes: ReadonlyArray<MarkSize> = ["xs", "choice", "sm", "account", "md", "lg"]

const markGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Marks", [
    ...markStatuses.map((status) =>
      sample(
        h,
        `Status ${status.label.toLowerCase()}, at every size: 20px, 22, 24, 28, 32, and 40, with its patch 7, 7, 8, 9, 9, and 10px, and its word in a tooltip on hover`,
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
      "A status mark alone, 9px, for an item with no mark of its own, in its tooltip, and the logo's mark of what is at work",
      [...markStatuses.map((status) => statusTooltip(h, status, [statusMark(h, status.kind)])), activityMark(h)],
      iconSizeRow
    ),
    sample(
      h,
      "The logo's mark of what is at work, 0.875rem, in each motion: the thread drawn through while it waits, the stitches lit while it works, and the patch tugged while it stops",
      [activityMark(h, "thread"), activityMark(h, "working"), activityMark(h, "tug")],
      iconSizeRow
    ),
    sample(
      h,
      "Where a task stands, in each drawing: triage, open, progress, paused, done, and dismissed, at 0.875rem and at the 1rem of a pane's title",
      [
        ...taskStatusShapes.map((shape) => taskStatus(h, shape)),
        ...taskStatusShapes.map((shape) => taskStatus(h, shape, { size: "1rem" }))
      ],
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
    sample(
      h,
      "Stack of two, three, and four, with an agent in its tone, each mark 22px and overlapping the last by 5px",
      [
        markStack(h, { marks: [{ text: "AM" }, { text: "Y" }], label: "2 members", onClick: Message.ClickedButton() }),
        markStack(h, {
          marks: [{ text: "AM" }, { text: "Y" }, { text: "S" }],
          label: "3 members",
          onClick: Message.ClickedButton()
        }),
        markStack(h, {
          marks: [{ text: "AM" }, { text: "Y" }, { text: "S" }, { text: "AI", tone: "lilac" }],
          label: "4 members",
          onClick: Message.ClickedButton()
        })
      ]
    )
  ])

const tooltipRow = "flex items-center gap-6 pt-4"

const tooltipScrollFrame = "mt-16 flex h-40 w-72 flex-col gap-32 overflow-y-auto outline outline-outline"

const tooltipTones = [
  { title: "Offline", detail: "It has not answered in a day." },
  { title: "Online", detail: "It is at work in #general.", tone: "success" },
  { title: "Needs setup", detail: "Its model connection was removed.", tone: "caution" },
  { title: "Unavailable", detail: "Its integration isn't installed on this host.", tone: "danger" }
] as const

const tooltipGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Tooltip", [
    sample(
      h,
      "A title and why under it, in each tone, above a mark the pointer rests on for 300ms; it is gone as soon as the pointer leaves",
      tooltipTones.map(({ title, detail, ...rest }) =>
        tooltip(h, { title, detail, ...rest, children: [mark(h, { text: title.slice(0, 1), size: "md" })] })
      ),
      tooltipRow
    ),
    sample(
      h,
      "The title alone, in each tone",
      tooltipTones.map(({ title, ...rest }) =>
        tooltip(h, { title, ...rest, children: [mark(h, { text: title.slice(0, 1), size: "md" })] })
      ),
      tooltipRow
    ),
    sample(
      h,
      "Over a control, which Tab reaches: the popover shows while the control has keyboard focus, and its label is what assistive technology reads",
      [
        tooltip(h, {
          title: "Follow",
          detail: "Get a notification when someone replies.",
          children: [iconButton(h, { icon: "bell", label: "Follow", onClick: Message.ClickedButton() })]
        })
      ],
      tooltipRow
    ),
    sample(h, "In a frame that scrolls, with the mark at its top edge: the popover is not cut off by the frame", [
      h.div(
        [h.Class(tooltipScrollFrame)],
        [
          tooltip(h, {
            title: "Needs setup",
            detail: "Its model connection was removed.",
            tone: "caution",
            children: [mark(h, { text: "R", size: "md" })]
          }),
          tooltip(h, {
            title: "Unavailable",
            detail: "Its integration isn't installed on this host.",
            tone: "danger",
            children: [mark(h, { text: "V", size: "md" })]
          })
        ]
      )
    ]),
    sample(
      h,
      "Below the mark, for one with no room above it, such as the mark in a pane's header",
      [
        tooltip(h, {
          title: "Needs setup",
          detail: "Its model connection was removed.",
          tone: "caution",
          placement: "below",
          children: [mark(h, { text: "R", size: "md" })]
        })
      ],
      "flex items-center gap-6 pb-16"
    )
  ])

/** A thread of the workshop's group as its list draws it: the message that opened it, and what hangs under it. */
type ThreadSample = Readonly<{
  key: string
  mark: string
  author: string
  isAgent?: boolean
  time: string
  /** Given, the message stacks under its author's before it and shows this in the mark's place. */
  shortTime?: string
  text: string
  task?: Readonly<{ shape: TaskStatusShape; status: string; title: string }>
  replies?: Readonly<{ marks: ReadonlyArray<MarkContent>; label: string; isUnread?: boolean }>
  typing?: string
  working?: ReadonlyArray<ThreadWork>
}>

const preview = { key: "preview-ready", mark: "AM", author: "Alex", time: "4:01 PM" } as const

const yumiWorking: ThreadWork = { state: "working", label: "Yumi working" }

const openableThreads: ReadonlyArray<ThreadSample> = [
  {
    ...preview,
    text: "The preview is ready for another look. I've linked the latest notes in the task.",
    replies: { marks: [{ text: "S" }, { text: "Y", tone: "lilac" }], label: "2 replies", isUnread: true }
  },
  {
    key: "release-notes",
    mark: "Y",
    author: "Yumi",
    isAgent: true,
    time: "4:20 PM",
    text: "Checked the build: all green. The release notes are ready too."
  },
  {
    key: "composer-paste-crash",
    mark: "AJ",
    author: "AJ",
    time: "10:02 AM",
    text: "found a bug. composer crashes when I paste an image from clipboard lol",
    task: { shape: "progress", status: "Doing", title: "Composer paste crash" },
    replies: { marks: [{ text: "AM" }, { text: "Y", tone: "lilac" }, { text: "S" }], label: "4 replies" }
  }
]

/**
 * A thread as the group lists it: its opening as a message, the task it tracks as a chip, and under it the button that
 * opens it, whether it has replies or not, with the reply as the hover action. Clicking any of them opens it.
 */
const threadRow = (h: ApplicationViewBuilder, thread: ThreadSample, openThread: string): Html => {
  const open = Message.OpenedThread({ key: thread.key })
  const common = {
    key: thread.key,
    mark: thread.mark,
    author: thread.author,
    ...(thread.isAgent === true ? { isAgent: true } : {}),
    time: thread.time,
    text: thread.text,
    isCurrent: thread.key === openThread,
    hoverActions: [{ icon: "mark-reply", label: "Reply in thread", onClick: open, description: thread.text }],
    meta: [
      ...(thread.task === undefined ? [] : [taskChip(h, { ...thread.task, onClick: open })]),
      thread.replies === undefined
        ? replyInThreadButton(h, {
            onClick: open,
            description: thread.text,
            ...(thread.typing === undefined ? {} : { typing: thread.typing }),
            ...(thread.working === undefined ? {} : { working: thread.working })
          })
        : repliesButton(h, {
            ...thread.replies,
            onClick: open,
            description: thread.text,
            ...(thread.typing === undefined ? {} : { typing: thread.typing }),
            ...(thread.working === undefined ? {} : { working: thread.working })
          })
    ]
  } as const

  return thread.shortTime === undefined
    ? message(h, common)
    : message(h, { ...common, isStacked: true, shortTime: thread.shortTime })
}

/** The members a text of the workshop may mention. */
const mentionable = [
  { id: "caleb", name: "Caleb" },
  { id: "jamie", name: "Jamie" },
  { id: "sara", name: "Sara" },
  { id: "yumi", name: "Yumi" }
]

/** `markdown` as a message's text, with the workshop's members as the ones its mentions name. */
const written = (markdown: string): MessageText => ({ text: markdown, mentions: mentionable })

/** A message that is formatted: a heading, emphasis, a list, code, a quote, a link, and a mention. */
const markdownMessage = [
  "## Release notes",
  "",
  "**Shipped** the retry fix for [@Jamie](member:jamie), see [the change](https://example.com/change):",
  "",
  "- the request is *kept* on retry",
  "- `retries` is capped at 3",
  "",
  "> Ready for another look."
].join("\n")

const messageGroup = (h: ApplicationViewBuilder, openThread: string, editText: string): Html => {
  const press = Message.ClickedButton()

  return group(h, "Messages", [
    sample(
      h,
      "The threads of a group under their day: the time of day after each author, a person's mark on the slate ground and an agent's on the lilac with its name in the agent's color, the task a thread tracks as a chip, and under each the button that opens it, with a reply as the action the pointer brings up; the open thread is filled, and follows a click",
      [
        messageList(h, {
          label: "Threads",
          children: [divider(h, "Today"), ...openableThreads.map((thread) => threadRow(h, thread, openThread))]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A person's messages within five minutes stacked under the one before, with no mark or name and the short time in the mark's place while the pointer or the keyboard is on it",
      [
        messageList(h, {
          label: "Stacked threads",
          children: [
            threadRow(
              h,
              {
                key: "deploy-clean",
                mark: "S",
                author: "Sara",
                time: "9:44 AM",
                text: "deploy went out clean last night!"
              },
              openThread
            ),
            threadRow(
              h,
              {
                key: "numbers-up",
                mark: "S",
                author: "Sara",
                time: "9:46 AM",
                shortTime: "9:46",
                text: "and the numbers are up"
              },
              openThread
            ),
            threadRow(
              h,
              {
                key: "dashboards",
                mark: "S",
                author: "Sara",
                time: "9:47 AM",
                shortTime: "9:47",
                text: "the dashboards agree with them"
              },
              openThread
            ),
            threadRow(
              h,
              { key: "morning-all", mark: "O", author: "Oliver", time: "9:52 AM", text: "morning all! ☕" },
              openThread
            )
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "The button that opens a thread with replies: with one reply, three people, more people than it shows, replies not yet read, and while Yumi works and Ada types",
      [
        messageList(h, {
          label: "Threads with replies",
          children: [
            threadRow(
              h,
              {
                key: "one-reply",
                mark: "S",
                author: "Sara",
                time: "9:44 AM",
                text: "deploy went out clean last night!",
                replies: { marks: [{ text: "O" }], label: "1 reply" }
              },
              openThread
            ),
            threadRow(
              h,
              {
                key: "three-people",
                mark: "AJ",
                author: "AJ",
                time: "10:02 AM",
                text: "found a bug. composer crashes when I paste an image from clipboard lol",
                replies: { marks: [{ text: "AM" }, { text: "Y", tone: "lilac" }, { text: "S" }], label: "4 replies" }
              },
              openThread
            ),
            threadRow(
              h,
              {
                key: "many-people",
                mark: "G",
                author: "Graeme",
                time: "10:08 AM",
                text: "Can everyone look at the release notes before noon?",
                replies: {
                  marks: [{ text: "AM" }, { text: "Y", tone: "lilac" }, { text: "S" }, { text: "O" }, { text: "AJ" }],
                  label: "12 replies",
                  isUnread: true
                }
              },
              openThread
            ),
            threadRow(
              h,
              {
                key: "busy",
                mark: "S",
                author: "Sara",
                time: "10:15 AM",
                text: "Atlas, can you take the release checklist?",
                replies: { marks: [{ text: "AM" }, { text: "Y", tone: "lilac" }], label: "3 replies" },
                working: [yumiWorking, { state: "queued", label: "Atlas queued" }],
                typing: "Ada is typing…"
              },
              openThread
            )
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A thread with no replies yet: Reply in thread as the words where there is no pointer to hover, a reply as the action where there is, and the button staying beside what is going on there",
      [
        messageList(h, {
          label: "Threads without replies",
          children: [
            threadRow(
              h,
              { key: "quiet", mark: "O", author: "Oliver", time: "9:41 AM", text: "morning all! ☕" },
              openThread
            ),
            threadRow(
              h,
              {
                key: "typed-in",
                mark: "S",
                author: "Sara",
                time: "10:12 AM",
                text: "Can Yumi check the release notes?",
                typing: "Yumi is typing…"
              },
              openThread
            ),
            threadRow(
              h,
              {
                key: "worked-in",
                mark: "S",
                author: "Sara",
                time: "10:14 AM",
                text: "Yumi, please check the release notes",
                working: [yumiWorking]
              },
              openThread
            )
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "The task a thread tracks, as a chip with where it stands drawn before its title, in every drawing a status has",
      [
        messageList(h, {
          label: "Tasks",
          children: taskStatusChoices.map(([status, statusLabel]) =>
            threadRow(
              h,
              {
                key: `task-${status}`,
                mark: "AJ",
                author: "AJ",
                time: "10:02 AM",
                text: "found a bug. composer crashes when I paste an image from clipboard lol",
                task: { shape: taskStatusDrawings[status], status: statusLabel, title: "Composer paste crash" }
              },
              openThread
            )
          )
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A note, an edited mark after the text, actions at the end of the author line, and meta under the text",
      [
        messageList(h, {
          label: "Replies",
          children: [
            message(h, {
              key: "reproduced",
              mark: "Y",
              author: "Yumi",
              time: "10:05 AM",
              text: "Reproduced on both. Images over 5 MB hit the crash.",
              isEdited: true,
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
            }),
            message(h, {
              key: "deleted",
              mark: "S",
              author: "Sara",
              time: "10:07 AM",
              text: { deleted: "Message deleted" }
            }),
            message(h, {
              key: "edited-markdown",
              mark: "Y",
              author: "Yumi",
              time: "10:09 AM",
              text: written("A **bold** claim, [@Sara](member:sara)."),
              isEdited: true
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A mention in the text as a chip: in a message, and in the current row",
      [
        messageList(h, {
          label: "Mentions",
          children: [
            message(h, {
              key: "plain-mention",
              mark: "G",
              author: "Graeme",
              time: "10:08 AM",
              text: written("[@Caleb](member:caleb) Let's grab some coffee")
            }),
            message(h, {
              key: "current-mention",
              mark: "AJ",
              author: "AJ",
              time: "10:15 AM",
              text: written("Thanks [@Sara](member:sara) and [@Yumi](member:yumi), both fixes are in."),
              isCurrent: true
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "Markdown in the text: as blocks in a message, and as a preview in a notification",
      [
        messageList(h, {
          label: "Markdown",
          children: [
            message(h, {
              key: "markdown-blocks",
              mark: "AJ",
              author: "AJ",
              time: "10:20 AM",
              text: written(markdownMessage)
            }),
            notification(h, {
              key: "markdown-notification",
              mark: { text: "S" },
              author: "Sara",
              activity: "replied",
              place: "#general",
              text: written(markdownMessage),
              age: "3m ago",
              isUnread: true,
              onOpen: press
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
              mark: { text: "S" },
              author: "Sara",
              activity: "mentioned you",
              place: "#general",
              text: written("[@Jamie](member:jamie) can you check the composer fix before we ship?"),
              age: "2m ago",
              isUnread: true,
              onOpen: press
            }),
            notification(h, {
              key: "atlas",
              mark: { text: "AT", tone: "lilac" },
              author: "Atlas",
              activity: "replied",
              place: "#engineering",
              text: "The retry now keeps the original request. Ready for another look.",
              age: "12m ago",
              isUnread: true,
              onOpen: press
            }),
            notification(h, {
              key: "oliver",
              mark: { text: "O" },
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
              mark: { text: "C" },
              author: "Caleb",
              activity: "mentioned you",
              place: "Caleb · Direct message",
              text: written("[@Jamie](member:jamie) let's grab coffee after the rollout."),
              age: "Yesterday",
              onOpen: press
            }),
            notification(h, {
              key: "activity",
              mark: { icon: "message" },
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
              mark: { text: "S" },
              author: "Sara",
              activity: "mentioned you",
              place: "#general",
              text: written("[@Jamie](member:jamie) can you check the composer fix before we ship?"),
              age: "2m ago",
              isUnread: true,
              onOpen: press
            }),
            notification(h, {
              key: "current-alex",
              mark: { text: "AM" },
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
              mark: { text: "O" },
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
              mark: { text: "C" },
              author: "Caleb",
              activity: "mentioned you",
              place: "Caleb · Direct message",
              text: written("[@Jamie](member:jamie) let's grab coffee after the rollout."),
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
    ),
    sample(
      h,
      "Notes of who took part, quiet lines with their time among the messages",
      [
        messageList(h, {
          label: "Thread",
          children: [
            divider(h, "Yesterday"),
            message(h, { key: "alex", mark: "AM", author: "Alex", time: "4:01 PM", text: "Can we review the plan?" }),
            note(h, { key: "followed", text: "Sara followed this thread", time: "4:02 PM" }),
            message(h, { key: "sara", mark: "S", author: "Sara", time: "4:10 PM", text: "Yes, after lunch." }),
            note(h, { key: "unfollowed", text: "You stopped following", time: "4:30 PM" }),
            note(h, { key: "left", text: "Sara left the group", time: "5:12 PM" }),
            note(h, { key: "removed", text: "Sara was removed from the group", time: "5:13 PM" }),
            note(h, { key: "removed-self", text: "You were removed from the workspace", time: "5:14 PM" })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "An agent's turn among the messages in each state, with the actions it offers and what it says under its line",
      [
        messageList(h, {
          label: "Turns",
          children: turnRowSamples(h)
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A turn's log opened under its row, and the row of a stop that did not go through",
      [
        messageList(h, {
          label: "Opened turn",
          children: [
            turnRow(h, {
              key: "opened",
              label: "Atlas's turn",
              mark: "A",
              name: "Atlas",
              status: turnStatus(h, "failed"),
              actions: [
                button(h, "View log", press, { variant: "quiet", isExpanded: true }),
                button(h, "Retry", press)
              ],
              detail: "The model provider is unavailable.",
              children: [log(h, { label: "Log", items: logLines }), hint(h, "The turn has ended.")]
            }),
            turnRow(h, {
              key: "refused",
              label: "Yumi's turn",
              mark: "Y",
              name: "Yumi",
              status: turnStatus(h, "working"),
              actions: [
                button(h, "View log", press, { variant: "quiet", isExpanded: false }),
                button(h, "Stop", press, { name: "Stop Yumi" })
              ],
              problem: "This turn has already finished."
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A turn that replied is its reply, with View turn log among the message's actions, and its log under it",
      [
        messageList(h, {
          label: "Reply",
          children: [
            message(h, {
              key: "reply",
              mark: "AT",
              author: "Atlas",
              time: "9:28 AM",
              text: "Deploy the API first, verify compatibility, then release clients on Thursday.",
              actions: [iconButton(h, { icon: "list", label: "View turn log", onClick: press }, { isPressed: true })]
            }),
            turnLog(h, {
              key: "reply-log",
              label: "Atlas's turn log",
              children: [log(h, { label: "Log", items: logLines }), hint(h, "The turn has ended.")]
            })
          ]
        })
      ],
      conversationColumn
    ),
    sample(
      h,
      "A turn's row in a column 20rem wide, where its actions drop under the name",
      [
        messageList(h, {
          label: "Narrow turn",
          children: [
            turnRow(h, {
              key: "narrow",
              label: "Atlas's turn",
              mark: "A",
              name: "Atlas",
              status: turnStatus(h, "stopped"),
              actions: [button(h, "View log", press, { variant: "quiet" }), button(h, "Retry", press)],
              detail: "Atlas stopped taking part in this thread."
            })
          ]
        })
      ],
      "flex w-80 flex-col px-3"
    )
  ])
}

const turnStates: ReadonlyArray<TurnState> = ["queued", "working", "stopping", "done", "failed", "stopped"]

/** An agent's turn in each state, with what it offers and says, as a thread's list holds them. */
const turnRowSamples = (h: ApplicationViewBuilder): ReadonlyArray<Html> => {
  const press = Message.ClickedButton()
  const viewLog = button(h, "View log", press, { variant: "quiet", isExpanded: false })
  const row = (key: string, name: string, state: TurnState, actions: ReadonlyArray<Html>, detail?: string) =>
    turnRow(h, {
      key,
      label: `${name}'s turn`,
      mark: name.charAt(0),
      name,
      status: turnStatus(h, state),
      actions,
      detail
    })

  return [
    row("queued", "Atlas", "queued", [viewLog, button(h, "Stop", press, { name: "Stop Atlas" })]),
    row("working", "Atlas", "working", [viewLog, button(h, "Stop", press, { name: "Stop Atlas" })]),
    row("stopping", "Atlas", "stopping", [viewLog, button(h, "Stop", press, { name: "Stopping", isDisabled: true })]),
    row("done", "Atlas", "done", [viewLog], "No reply posted."),
    row("failed", "Atlas", "failed", [viewLog, button(h, "Retry", press)], "Anthropic needs its API key."),
    row("departed", "Atlas", "stopped", [viewLog], "Atlas stopped taking part in this thread."),
    row("task", "Atlas", "stopped", [viewLog], "The task no longer asks Atlas to work on it."),
    row("requested", "Atlas", "stopped", [viewLog, button(h, "Retry", press)])
  ]
}

/** A message that uses every form markdown has, and the mention of a member the workshop does not know. */
const everyFormOfRichText = [
  "# A heading keeps the size of the text",
  "",
  'A paragraph with *emphasis*, **strong text**, ~~strikethrough~~, `inline code`, and a [link](https://example.com "With a title").',
  "A second line of the same paragraph, then a mention of [@Ada](member:ada) and of [@Gone](member:gone), whom the workshop does not know.",
  "",
  "> A block quote that runs over two lines,",
  "> with a [mail link](mailto:ada@example.com) in it.",
  "",
  "1. A numbered item",
  "2. Another, with a bulleted list inside:",
  "   - first",
  "   - second",
  "",
  "- [x] A task that is done",
  "- [ ] A task still to do",
  "",
  "```ts",
  "const answer = 42",
  "```",
  "",
  "| Name | Count | Share |",
  "| :--- | :---: | ---: |",
  "| Ada | 3 | 60% |",
  "| Grace | 2 | 40% |",
  "",
  "---",
  "",
  "An image ![A chart](https://example.com/chart.png) shows as a link, [an unsafe link](javascript:alert(1)) as its text, <b>raw HTML</b> as written, and &amp; &copy; &#169; as characters."
].join("\n")

const richTextMentions = [{ id: "ada", name: "Ada Lovelace" }]

const richTextGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Rich text", [
    sample(
      h,
      "A message's text with every form",
      [richText(h, { text: everyFormOfRichText, mentions: richTextMentions })],
      richTextColumn
    ),
    sample(
      h,
      "The inline form for a preview: one run of words and mentions",
      [
        h.p(
          [h.Class(richTextPreview)],
          [richText(h, { text: everyFormOfRichText, mentions: richTextMentions, isInline: true })]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "In a narrow column, a long word wraps and a wide table scrolls",
      [
        richText(h, {
          text: [
            "https://example.com/a/very/long/address/that/has/no/place/to/break/in/a/narrow/column",
            "",
            "| Identifier | Description | Responsibility | Status |",
            "| - | - | - | - |",
            "| authentication-service | retries-on-timeout | platform-team | operational |"
          ].join("\n")
        })
      ],
      richTextNarrowColumn
    )
  ])

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
              body: [paneEmpty(h, { art: "rest", title: "You're all caught up", copy: "Nothing new." })]
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "A title and two lines of copy, each a paragraph of its own",
      [
        h.div(
          [h.Class(emptyPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "general",
              header: { title: "general", icon: "mark-channel" },
              body: [
                paneEmpty(h, {
                  art: "caret",
                  title: "Welcome to #general",
                  copy: ["You, Alex Morgan, and Sara are members.", "Send the first message to start the conversation."]
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
                  art: "sew-in",
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
              body: [paneEmpty(h, { art: "fill", title: "No tasks yet" })]
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "Waiting on the host: the logo working, in a live region",
      [
        h.div(
          [h.Class(emptyPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Settings",
              header: { title: "Settings", icon: "mark-settings" },
              body: [paneEmpty(h, { art: "working", title: "Opening your workspace", copy: "This takes a moment." })]
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "A failure, with a way to try again",
      [
        h.div(
          [h.Class(emptyPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Settings",
              header: { title: "Settings", icon: "mark-settings" },
              body: [
                paneEmpty(h, {
                  art: "came-apart",
                  title: "Can't load settings",
                  copy: "Try again once the host is reachable.",
                  action: button(h, "Try again", press)
                })
              ]
            })
          ]
        )
      ],
      "flex flex-col"
    )
  ])
}

const stateArtMeanings: Readonly<Record<StateArtKind, string>> = {
  "sew-in": "a new piece sewn in beside empty outlines, for a first thing to make",
  reach: "a thread reaching for an empty outline, for nothing connected yet",
  fill: "an outline filling in, for a place waiting for its first thing",
  caret: "a stitch blinking on a seam, for nothing said yet",
  rest: "the mark breathing, for nothing left to do",
  "came-apart": "the patch swinging loose, for something that failed",
  "lost-thread": "the thread between two pieces snapping back, for something out of reach",
  "nothing-here": "a scan across an empty hole, for something that isn't there",
  "held-back": "the patch straining at its stitches, for access the reader lacks"
}

const stateArtGroup = (h: ApplicationViewBuilder): Html =>
  group(
    h,
    "State art",
    stateArtKinds.map((kind) =>
      sample(h, `${kind}: ${stateArtMeanings[kind]}`, [h.div([h.Class("text-ink")], [stateArt(h, kind)])])
    )
  )

const logoSizes: ReadonlyArray<string> = ["0.875rem", "1rem", "1.25rem", "2rem", "3.5rem"]

const logoGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Logo", [
    sample(
      h,
      "Sizes: 0.875rem, 1rem, 1.25rem (the default), 2rem, and 3.5rem, in the color of the text around it",
      logoSizes.map((size) => logo(h, { size })),
      iconSizeRow
    ),
    sample(
      h,
      "Decorative, hidden from assistive technology, and named, which makes it an image",
      [logo(h, { size: "2rem" }), logo(h, { size: "2rem", label: "amends" })],
      iconSizeRow
    ),
    sample(
      h,
      "Motions, looping: sew-on, thread, tug, and working",
      logoMotions.map((motion) =>
        h.div(
          [h.Class("flex flex-col items-center gap-2 text-hint text-ink-secondary")],
          [logo(h, { size: "3.5rem", motion }), motion]
        )
      ),
      "flex items-end gap-8"
    ),
    sample(
      h,
      "Hover the link and the button: the patch lifts and the stitches swell",
      [
        h.a(
          [h.Href("#logo"), h.AriaLabel("Amends home"), h.Class("inline-flex size-10 items-center justify-center")],
          [logo(h, { size: "2rem" })]
        ),
        h.button(
          [
            h.Type("button"),
            h.AriaLabel("Amends home"),
            h.OnClick(Message.ClickedButton()),
            h.Class("inline-flex size-10 cursor-pointer items-center justify-center bg-transparent p-0")
          ],
          [logo(h, { size: "2rem" })]
        ),
        h.button(
          [
            h.Type("button"),
            h.AriaLabel("Working"),
            h.OnClick(Message.ClickedButton()),
            h.Class("inline-flex size-10 cursor-pointer items-center justify-center bg-transparent p-0")
          ],
          [logo(h, { size: "2rem", motion: "working" })]
        )
      ],
      iconSizeRow
    ),
    sample(
      h,
      "On the canvas, which the rail draws it on, cut out of the canvas",
      [
        h.div(
          [h.Class("bg-canvas p-4 [--amends-status-knockout:var(--amends-canvas)]")],
          [logo(h, { size: "2rem", motion: "thread" })]
        )
      ],
      iconSizeRow
    )
  ])

const loadingGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Loading", [
    sample(
      h,
      "A line that says what is waited for, in a live region",
      [loadingLine(h, "Loading your inbox…")],
      sampleStack
    ),
    sample(
      h,
      "Rows for a list of 32px marks, as agents and connections show: three unless given",
      [loadingRows(h, { label: "Loading agents…", markSize: "md" })],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Rows for 40px marks, as groups and workspaces show, two of them",
      [loadingRows(h, { label: "Loading workspaces…", count: 2 })],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "Rows for 24px marks, as a table of people shows",
      [loadingRows(h, { label: "Loading members…", markSize: "sm", count: 4 })],
      "flex max-w-2xl flex-col"
    ),
    sample(
      h,
      "In a pane, whose header and tabs stay while its list is read",
      [
        h.div(
          [h.Class(columnPaneFrame)],
          [
            pane(h, {
              variant: "main",
              label: "Agents",
              header: {
                title: "Agents",
                icon: "mark-agents",
                tabs: paneTabs(h, {
                  label: "Agents",
                  tabs: [
                    { label: "All", isCurrent: true, onClick: Message.ClickedButton() },
                    { label: "Needs setup", isCurrent: false, onClick: Message.ClickedButton() }
                  ]
                })
              },
              body: [paneColumn(h, [loadingRows(h, { label: "Loading agents…", markSize: "md" })], { isWide: true })]
            })
          ]
        )
      ],
      "flex flex-col"
    )
  ])

const codeInputGroup = (h: ApplicationViewBuilder, code: string): Html => {
  const press = () => Message.ClickedButton()

  return group(h, "Code input", [
    sample(
      h,
      "Type, paste, or delete: only digits are kept, the cell the next goes into is outlined while it has focus, and the sixth completes it",
      [
        codeInput(
          h,
          {
            id: "code-typed",
            label: "Verification code",
            value: code,
            hint: code.length === 6 ? "That is all six digits." : "Use your most recent code.",
            onInput: (value) => Message.TypedCode({ value }),
            onComplete: (value) => Message.TypedCode({ value }),
            isAutofocus: false
          },
          Option.none()
        )
      ],
      sampleStack
    ),
    sample(
      h,
      "Empty, part filled, and complete",
      ["", "482", "482916"].map((value) =>
        codeInput(
          h,
          { id: `code-${value.length}`, label: "Verification code", value, onInput: press, isAutofocus: false },
          Option.none()
        )
      ),
      sampleStack
    ),
    sample(
      h,
      "Refused: every cell is outlined in danger, and the reason describes the input",
      [
        codeInput(
          h,
          { id: "code-refused", label: "Verification code", value: "482916", onInput: press, isAutofocus: false },
          Option.some("That code doesn't match. Check it and try again.")
        )
      ],
      sampleStack
    ),
    sample(
      h,
      "Disabled, while a code is checked",
      [
        codeInput(
          h,
          {
            id: "code-disabled",
            label: "Verification code",
            value: "482916",
            onInput: press,
            isDisabled: true,
            isAutofocus: false
          },
          Option.none()
        )
      ],
      sampleStack
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
          label: "Message #general",
          placeholder: "Message #general",
          value: draft,
          onInput: (value) => Message.TypedDraft({ value }),
          onSubmit: press,
          submitLabel: "Send"
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
          label: "Reply in thread",
          placeholder: "Reply in thread",
          value: filledDraft,
          onInput: (value) => Message.TypedFilledDraft({ value }),
          onSubmit: press,
          submitLabel: "Send"
        })
      ],
      composerColumn
    ),
    sample(
      h,
      "Only spaces, which count as empty: Send is unavailable",
      [
        composer(h, {
          id: "spaces-draft",
          label: "Reply in thread",
          placeholder: "Reply in thread",
          value: "   ",
          onInput: () => press,
          onSubmit: press,
          submitLabel: "Send"
        })
      ],
      composerColumn
    ),
    sample(
      h,
      "Mentioning, the second person active and an agent among them in its tone",
      [
        composer(h, {
          id: "mentioning-draft",
          label: "Reply in thread",
          placeholder: "Reply in thread",
          value: "Can you look, @al",
          onInput: () => press,
          onSubmit: press,
          submitLabel: "Send",
          suggestions: {
            id: "mentioning-members",
            items: [
              { id: "alex", mark: { text: "AM" }, name: "Alex Morgan", isActive: false, onPick: press },
              { id: "alma", mark: { text: "AI", tone: "lilac" }, name: "Alma Ito", isActive: true, onPick: press },
              { id: "alan", mark: { text: "AT" }, name: "Alan Turing", isActive: false, onPick: press }
            ],
            onKeyDown: () => Option.none()
          }
        })
      ],
      mentioningColumn
    )
  ])
}

const memberFilterChoices: ReadonlyArray<readonly [MemberFilter, string]> = [
  ["active", "Active members"],
  ["removed", "Removed members"]
]

const taskFilterChoices: ReadonlyArray<readonly [TaskFilter, string]> = [
  ["all", "Any status"],
  ["triage", "Triage"],
  ["todo", "To do"],
  ["doing", "In progress"]
]

const taskSortChoices: ReadonlyArray<readonly [TaskSort, string]> = [
  ["activity", "Latest activity"],
  ["newest", "Newest"],
  ["oldest", "Oldest"]
]

/**
 * Where a menu is shown: among the menu samples, or in the pane whose toolbar holds it. Each place has its own Block.
 */
type Place = "sample" | "pane"

const memberFilterMenu = (h: ApplicationViewBuilder, model: Model, place: Place): Html =>
  choiceMenu(h, {
    choices: memberFilterChoices,
    value: model.memberFilter,
    placement: "bottom-end",
    embed: (viewInputs) =>
      place === "sample"
        ? h.block(MemberFilterBinding.embedView({ slotId: "member-filter", model: model.memberFilterMenu, viewInputs }))
        : h.block(
            MembersPaneFilterBinding.embedView({
              slotId: "members-pane-filter",
              model: model.membersPaneFilterMenu,
              viewInputs
            })
          )
  })

const assigneeFilterChoices: ReadonlyArray<ChoiceMenuChoice<AssigneeFilter>> = [
  ["anyone", "Anyone"],
  ["unassigned", "Unassigned"],
  ["alex", "Alex Morgan", { text: "AM" }],
  ["yumi", "Yumi Tanaka", { text: "YT" }],
  ["review-helper", "Review helper", { text: "R", tone: "lilac" }]
]

/** The assignee filter says "Assignee" while anyone is chosen, and who or what was chosen once one is. */
const assigneeFilterMenu = (h: ApplicationViewBuilder, model: Model): Html => {
  const current = assigneeFilterChoices.find(([value]) => value === model.assigneeFilter)?.[1] ?? ""

  return choiceMenu(h, {
    choices: assigneeFilterChoices,
    value: model.assigneeFilter,
    ...(model.assigneeFilter === "anyone" ? { text: "Assignee" } : {}),
    name: `Assignee: ${current}`,
    embed: (viewInputs) =>
      h.block(
        AssigneeFilterBinding.embedView({ slotId: "assignee-filter", model: model.assigneeFilterMenu, viewInputs })
      )
  })
}

/** The status filter says "Status" while every status is chosen, and the status once one is. */
const taskFilterMenu = (h: ApplicationViewBuilder, model: Model, place: Place): Html =>
  choiceMenu(h, {
    choices: taskFilterChoices,
    value: model.taskFilter,
    ...(model.taskFilter === "all" ? { text: "Status" } : {}),
    embed: (viewInputs) =>
      place === "sample"
        ? h.block(TaskFilterBinding.embedView({ slotId: "task-filter", model: model.taskFilterMenu, viewInputs }))
        : h.block(
            ToolbarFilterBinding.embedView({ slotId: "toolbar-filter", model: model.toolbarFilterMenu, viewInputs })
          )
  })

const taskSortMenu = (h: ApplicationViewBuilder, model: Model, place: Place): Html => {
  const current = taskSortChoices.find(([value]) => value === model.taskSort)?.[1] ?? ""

  return choiceMenu(h, {
    choices: taskSortChoices,
    value: model.taskSort,
    name: `Sort: ${current}`,
    embed: (viewInputs) =>
      place === "sample"
        ? h.block(TaskSortBinding.embedView({ slotId: "task-sort", model: model.taskSortMenu, viewInputs }))
        : h.block(ToolbarSortBinding.embedView({ slotId: "toolbar-sort", model: model.toolbarSortMenu, viewInputs }))
  })
}

/** The account's menu: the three appearances, the entries that go somewhere, and the one that ends the session. */
const accountGroups = (appearance: Appearance): ReadonlyArray<MenuGroup<AccountEntry>> => [
  {
    label: "Appearance",
    choices: (
      [
        ["system", "System"],
        ["light", "Light"],
        ["dark", "Dark"]
      ] as const
    ).map(([value, label]) => ({ value, label, isChecked: appearance === value }))
  },
  {
    choices: [
      { value: "switch-workspace", label: "Switch workspace" },
      { value: "settings", label: "Workspace settings" },
      { value: "name", label: "Change your name…" }
    ]
  },
  { choices: [{ value: "sign-out", label: "Sign out" }] }
]

/**
 * The closed button of a menu, drawn without its Block, for the frames that show the rail more than once: the Block
 * owns the ids of its button and its list, so one frame has the menu that opens and the rest show it closed.
 */
const closedMenuButton =
  (h: ApplicationViewBuilder) =>
  (viewInputs: ViewInputs<AccountEntry>): Html =>
    h.div(
      [h.Class(viewInputs.className ?? "")],
      [
        h.button(
          [h.Type("button"), h.AriaLabel(viewInputs.ariaLabel ?? ""), h.Class(viewInputs.buttonClassName ?? "")],
          [viewInputs.buttonContent]
        )
      ]
    )

const menuFrame = "flex h-72 items-start gap-6"

const menuGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  group(h, "Menu", [
    sample(
      h,
      "A choice: the current one on the button with a chevron, the list opening below from its start, the current choice checked; the button says Status while every status is chosen",
      [taskFilterMenu(h, model, "sample"), taskSortMenu(h, model, "sample"), memberFilterMenu(h, model, "sample")],
      menuFrame
    ),
    sample(
      h,
      "A choice with a mark before each person: Anyone and Unassigned, then each person at 22px, the button saying Assignee while anyone is chosen and the person's name once one is",
      [assigneeFilterMenu(h, model)],
      menuFrame
    ),
    sample(
      h,
      "Groups behind a plain button: a header of a title over a detail, a labelled group of checked choices, actions, and a line between the groups, opening to the right and below, with the account's mark as its button",
      [
        menu(h, {
          trigger: { variant: "plain", name: "Account: Jamie Morgan", content: mark(h, { text: "JM" }) },
          header: { title: "Jamie Morgan", detail: "jamie@mercier.example" },
          groups: accountGroups(model.appearance),
          embed: (viewInputs) =>
            h.block(AccountBinding.embedView({ slotId: "account", model: model.accountMenu, viewInputs }))
        }),
        h.p([h.Role("status"), h.Class(lineText)], [`Last chosen: ${model.accountChoice}`])
      ],
      menuFrame
    )
  ])

type TaskSample = Readonly<{
  title: string
  status: TaskStatus
  assignee?: Readonly<{ name: string; mark: MarkContent }>
  place: string
  age: string
  isCurrent?: boolean
  isSending?: boolean
}>

const alexMorgan = { name: "Alex Morgan", mark: { text: "AM" } } as const

const yumi = { name: "Yumi", mark: { text: "Y", tone: "lilac" } } as const

const taskSamples: ReadonlyArray<TaskSample> = [
  { title: "Composer crashes on paste", status: "todo", assignee: alexMorgan, place: "#general", age: "2m ago" },
  {
    title: "Plan the launch week",
    status: "doing",
    assignee: { name: "Sara", mark: { text: "S" } },
    place: "#design",
    age: "14m ago",
    isCurrent: true
  },
  { title: "Review the logo", status: "triage", place: "#design", age: "1h ago" },
  {
    title: "Ship the release, and tell every group the week before the long weekend that it is out",
    status: "held",
    assignee: yumi,
    place: "#general",
    age: "3h ago"
  },
  { title: "Fix the sidebar count", status: "done", assignee: alexMorgan, place: "Bob", age: "Yesterday" },
  { title: "Write the changelog", status: "dismissed", place: "#general", age: "Sep 20" },
  { title: "Draft the invoice", status: "todo", place: "#finance", age: "Just now", isSending: true }
]

/** The rows of the samples, with the place each is in when the list holds the tasks of several groups. */
const taskListRows = (hasPlaces: boolean): ReadonlyArray<TaskListRow<Message>> =>
  taskSamples.map((sample) => ({
    key: sample.title,
    title: sample.title,
    status: {
      shape: taskStatusDrawings[sample.status],
      label: taskStatusChoices.find(([value]) => value === sample.status)?.[1] ?? sample.status
    },
    isFinished: sample.status === "done" || sample.status === "dismissed",
    ...(hasPlaces ? { place: sample.place } : {}),
    ...(sample.assignee === undefined ? {} : { assignee: sample.assignee }),
    activity: sample.isSending === true ? "Sending…" : sample.age,
    ...(sample.isCurrent === true ? { isCurrent: true } : {}),
    onClick: Message.ClickedButton()
  }))

/**
 * A list's pane with its toolbar: the search and the status filter at the start, the sort and the action that adds at
 * the end, then the line that says what the list holds and the labels of its columns, all of which stay while the rows
 * scroll under them.
 */
const taskListPane = (h: ApplicationViewBuilder, model: Model): Html =>
  pane(h, {
    variant: "main",
    label: "Tasks",
    header: { title: "Tasks", icon: "mark-tasks", subtitle: "Every open task you can see." },
    toolbar: [
      paneToolbar(h, {
        start: [
          searchField(h, {
            id: "workshop-task-search",
            label: "Search tasks",
            placeholder: "Search tasks…",
            value: model.taskQuery,
            onInput: (value) => Message.TypedTaskQuery({ value })
          }),
          taskFilterMenu(h, model, "pane")
        ],
        end: [taskSortMenu(h, model, "pane"), button(h, "New task", Message.ClickedButton(), { icon: "mark-new" })]
      }),
      summary(h, { copy: "Open tasks across your groups.", count: `${taskSamples.length} tasks` }),
      taskHeadings(h)
    ],
    body: [paneColumn(h, [taskList(h, taskListRows(true))], { isWide: true })]
  })

/**
 * The `frame` that the workshop is opened with to show a list's pane alone, its toolbar and its task rows. The toolbar
 * wraps, the labels over the rows and the columns of the rows change, by the width of the window and not of what holds
 * them, so the pane is shown in frames that are windows of their own: 360px wide, 52rem, and 66rem.
 */
export const listPaneFrame = "list-pane"

const paneToolbarGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  group(h, "Pane toolbar", [
    sample(
      h,
      "Over a list that scrolls: the search and the filter at the start, a sort and New task at the end, and the line and the column labels flush under them",
      [h.div([h.Class(toolbarPaneFrame)], [taskListPane(h, model)])],
      "flex flex-col"
    ),
    sample(
      h,
      "Wrapped below 48rem in a frame 360px wide: the search a line of its own, the filter and the actions under it",
      [
        h.iframe([
          h.Class(phoneWindowFrame),
          h.Title("Pane toolbar in a window 360px wide"),
          h.Src(`?frame=${listPaneFrame}`)
        ])
      ],
      "flex flex-col"
    )
  ])

const taskListGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Task list", [
    sample(
      h,
      "A group's Tasks tab: the labels over the rows, each 56px tall, the status drawn at 1rem, the title in medium weight and quiet once done or dismissed, an assignee as a 24px mark and name or the people icon and Unassigned, and the activity at the end; the second is open beside the list, a long title is cut with an ellipsis, and a task on its way says Sending…",
      [taskHeadings(h), taskList(h, taskListRows(false))],
      taskListColumn
    ),
    sample(
      h,
      "The workspace's lists, which hold the tasks of several groups: the group after each title in quiet text",
      [taskHeadings(h), taskList(h, taskListRows(true))],
      taskListColumn
    ),
    sample(
      h,
      "Filters that leave no task: the labels over a quiet line",
      [taskHeadings(h), taskListEmpty(h, "No tasks match these filters.")],
      taskListColumn
    ),
    sample(
      h,
      "From 64rem in a frame 66rem wide, with the status words and every label; from 48rem to 64rem in a frame 52rem wide, without the status words and their label; below 48rem in a frame 360px wide, with no labels and no assignee names, and a title that wraps",
      [
        h.iframe([
          h.Class(desktopWindowFrame),
          h.Title("Task list in a window 66rem wide"),
          h.Src(`?frame=${listPaneFrame}`)
        ]),
        h.iframe([
          h.Class(touchWindowFrame),
          h.Title("Task list in a window 52rem wide"),
          h.Src(`?frame=${listPaneFrame}`)
        ]),
        h.iframe([
          h.Class(phoneWindowFrame),
          h.Title("Task list in a window 360px wide"),
          h.Src(`?frame=${listPaneFrame}`)
        ])
      ],
      "flex flex-col gap-6"
    )
  ])

const labelledLines = (h: ApplicationViewBuilder, lines: ReadonlyArray<readonly [string, string]>): Html =>
  h.div(
    [h.Class(lineColumn)],
    lines.map(([author, text]) =>
      h.div([h.Class(lineGroup)], [h.span([h.Class(lineLabel)], [author]), h.p([h.Class(lineText)], [text])])
    )
  )

const shellRail = (h: ApplicationViewBuilder, current: Destination, model?: Model): Html => {
  const toItem = (item: Readonly<{ destination: Destination; icon: IconName; label: string }>) => ({
    icon: item.icon,
    label: item.label,
    isCurrent: item.destination === current,
    onClick: Message.ChangedDestination({ destination: item.destination })
  })

  return rail(h, {
    brand: { label: "Amends home", onClick: Message.ClickedButton() },
    items: railDestinations.map(toItem),
    search: { label: "Search", onClick: Message.ClickedButton() },
    footer: [toItem(railSettings)],
    account: railAccount(h, {
      name: "Jamie Morgan",
      initials: "JM",
      header: { title: "Jamie Morgan", detail: "jamie@mercier.example" },
      groups: accountGroups(model?.appearance ?? "system"),
      embed:
        model === undefined
          ? closedMenuButton(h)
          : (viewInputs) =>
              h.block(
                RailAccountBinding.embedView({ slotId: "rail-account", model: model.railAccountMenu, viewInputs })
              )
    })
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
          sidebarItem(h, {
            icon: "mark-mail",
            label: "Inbox",
            count: 3,
            countName: "unread",
            isCurrent: false,
            onClick: press
          }),
          sidebarItem(h, {
            icon: "mark-triage",
            label: "Triage",
            count: 5,
            countName: "to triage",
            isCurrent: false,
            onClick: press
          }),
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
            sidebarItem(h, {
              icon: "mark-channel",
              label: "design",
              count: 2,
              countName: "for you",
              isCurrent: false,
              onClick: press
            }),
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
          ...(agent.activity === undefined
            ? {}
            : {
                activity: `${agent.activity.state} in ${agent.activity.place}`,
                activityMotion: agent.activity.motion
              }),
          label: agent.name,
          isCurrent: agent.name === current,
          onClick: press
        })
      )
    })
  ])
}

const settingsSidebar = (h: ApplicationViewBuilder): Html => {
  const press = Message.ClickedButton()

  return destinationSidebar(h, [
    sidebarSection(h, {
      label: "Settings",
      children: [
        sidebarItem(h, { icon: "mark-settings", label: "Workspace", isCurrent: false, onClick: press }),
        sidebarItem(h, { icon: "users", label: "Members", isCurrent: true, onClick: press })
      ]
    })
  ])
}

const membersPane = (h: ApplicationViewBuilder, model: Model): Html => {
  const press = Message.ClickedButton()

  return pane(h, {
    variant: "main",
    label: "Members",
    header: {
      title: "Members",
      icon: "users",
      phoneContext: "Mercier & Co",
      actions: [button(h, "Invite people", press)]
    },
    toolbar: [
      paneToolbar(h, {
        start: [
          searchField(h, {
            id: "member-search",
            label: "Search members",
            placeholder: "Search members…",
            value: "",
            onInput: () => press
          })
        ],
        end: [memberFilterMenu(h, model, "pane")]
      }),
      memberColumns(h)
    ],
    body: [
      paneColumn(
        h,
        [
          memberList(h),
          section(h, {
            label: "Pending invitations",
            count: pendingInvitations.length,
            action: button(h, "View history", press, { variant: "quiet" })
          }),
          pendingInvitationList(h)
        ],
        { isWide: true }
      )
    ]
  })
}

const memberPane = (h: ApplicationViewBuilder): Html => {
  const press = Message.ClickedButton()

  return pane(h, {
    variant: "side",
    label: "Member details",
    header: {
      title: "Member details",
      leading: paneBack(h, press, "Back to Members"),
      actions: [paneClose(h, press)],
      subtitle: "Mercier & Co"
    },
    body: [
      paneColumn(h, [
        person(h, { mark: { text: "AM" }, name: "Alex Morgan", detail: "Person · Active" }),
        paneForm(h, { title: "Workspace role", onSubmit: press }, [
          choiceSelect(
            h,
            {
              id: "member-role",
              label: "Workspace role",
              choices: [
                ["member", "Member"],
                ["administrator", "Administrator"]
              ],
              value: "member",
              hint: "Changing the workspace role keeps any separate permissions in place.",
              onChange: () => press
            },
            { isLabelHidden: true }
          ),
          buttonRow(h, [submit(h, "Save role", { isDisabled: true })])
        ]),
        paneSection(h, {
          title: "Access",
          hasStitch: true,
          children: [
            entryList(h, {
              label: "Access",
              children: [entry(h, { key: "member", title: "Member", children: [hint(h, "Workspace · Active")] })]
            })
          ]
        }),
        paneSection(h, {
          title: "Membership",
          hasStitch: true,
          children: [
            buttonRow(h, [button(h, "Remove member", press)]),
            hint(h, "Rejoining after removal requires a new invitation.")
          ]
        })
      ])
    ]
  })
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
    toolbar: [
      paneToolbar(h, {
        start: [
          searchField(h, {
            id: "workshop-agents-search",
            label: "Search agents",
            placeholder: "Search agents…",
            value: query,
            onInput: (value) => Message.TypedAgentQuery({ value })
          })
        ]
      }),
      agentColumns(h)
    ],
    body: [paneColumn(h, [agentList(h)], { isWide: true })]
  })

const groupThreads = (h: ApplicationViewBuilder): Html => {
  const openThread = "composer-paste-crash"
  const thread = (sample: ThreadSample) => threadRow(h, sample, openThread)

  return messageList(h, {
    label: "Threads",
    children: [
      divider(h, "Yesterday"),
      thread({
        ...preview,
        time: "4:01 PM",
        text: "The preview is ready for another look. I've linked the latest notes in the task."
      }),
      thread({
        key: "release-morning",
        mark: "S",
        author: "Sara",
        time: "4:30 PM",
        text: "Looks good. I'll keep an eye on the release this morning."
      }),
      divider(h, "Today"),
      thread({ key: "morning-all", mark: "O", author: "Oliver", time: "9:41 AM", text: "morning all! ☕" }),
      thread({
        key: "deploy-clean",
        mark: "S",
        author: "Sara",
        time: "9:44 AM",
        text: "deploy went out clean last night! 🎉"
      }),
      thread({
        key: "composer-paste-crash",
        mark: "AJ",
        author: "AJ",
        time: "10:02 AM",
        text: "found a bug. composer crashes when I paste an image from clipboard lol",
        task: { shape: "progress", status: "Doing", title: "Composer paste crash" },
        replies: { marks: [{ text: "AM" }, { text: "Y", tone: "lilac" }, { text: "S" }], label: "4 replies" },
        working: [yumiWorking]
      }),
      thread({
        key: "coffee",
        mark: "G",
        author: "Graeme",
        time: "10:08 AM",
        text: "@Caleb Let's grab some coffee",
        typing: "Caleb is typing…"
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
    anchor: paneTab === "threads" ? "bottom" : "top",
    footer: [
      composer(h, {
        id: "composer",
        label: "Message #general",
        placeholder: "Message #general",
        value: composerText,
        onInput: (value) => Message.TypedComposer({ value }),
        onSubmit: press,
        submitLabel: "Send"
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
      leading: paneBack(h, press, "Back to general"),
      actions: [
        iconButton(h, { icon: "bell", label: "Follow thread", onClick: press }, { isPressed: false }),
        paneClose(h, press, "Close thread")
      ]
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
        label: "Reply in thread",
        placeholder: "Reply in thread",
        value: reply,
        onInput: (value) => Message.TypedReply({ value }),
        onSubmit: press,
        submitLabel: "Send"
      })
    ]
  })
}

const taskStatusDrawings: Readonly<Record<TaskStatus, TaskStatusShape>> = {
  triage: "triage",
  todo: "open",
  doing: "progress",
  held: "paused",
  done: "done",
  dismissed: "dismissed"
}

const statusProperties: ReadonlyArray<PropertyChoice<TaskStatus>> = taskStatusChoices.map(([value, label]) => ({
  value,
  label,
  taskStatus: taskStatusDrawings[value]
}))

const priorityProperties: ReadonlyArray<PropertyChoice<TaskPriority>> = taskPriorityChoices.map(([value, label]) => ({
  value,
  label
}))

const assigneeProperties: ReadonlyArray<PropertyChoice<TaskAssignee>> = [
  { value: "", label: "Unassigned", buttonIcon: "users" },
  { value: "alex", label: "Alex Morgan", mark: { text: "AM" } },
  { value: "yumi", label: "Yumi", mark: { text: "Y", tone: "lilac" } }
]

/**
 * A task in the side pane, as `apps/ui` has it: its status drawn before its title, the properties as quiet menus, the
 * description, and the activity over the replies, all in one stack of 28px.
 */
const taskPane = (h: ApplicationViewBuilder, model: Model): Html => {
  const press = Message.ClickedButton()

  return pane(h, {
    variant: "side",
    label: "Composer paste crash",
    header: {
      title: "Composer paste crash",
      taskStatus: taskStatusDrawings[model.taskStatus],
      subtitle: "Task in #general",
      leading: paneBack(h, press, "Back to Tasks"),
      actions: [
        iconButton(h, { icon: "bell", label: "Follow thread", onClick: press }, { isPressed: false }),
        paneClose(h, press, "Close task")
      ]
    },
    body: [
      paneStack(h, [
        properties(h, {
          label: "Task",
          children: [
            propertyMenu(h, {
              caption: "Status",
              choices: statusProperties,
              value: model.taskStatus,
              embed: (viewInputs) =>
                h.block(
                  TaskStatusBinding.embedView({
                    slotId: "status-property",
                    model: model.statusPropertyMenu,
                    viewInputs
                  })
                )
            }),
            propertyMenu(h, {
              caption: "Assignee",
              choices: assigneeProperties,
              value: model.taskAssignee,
              embed: (viewInputs) =>
                h.block(
                  TaskAssigneeBinding.embedView({
                    slotId: "assignee-property",
                    model: model.assigneePropertyMenu,
                    viewInputs
                  })
                )
            }),
            propertyMenu(h, {
              caption: "Priority",
              choices: priorityProperties,
              value: model.taskPriority,
              embed: (viewInputs) =>
                h.block(
                  TaskPriorityBinding.embedView({
                    slotId: "priority-property",
                    model: model.priorityPropertyMenu,
                    viewInputs
                  })
                )
            })
          ]
        }),
        property(h, {
          caption: "Description",
          children: [
            description(h, {
              text: "Handle clipboard images over 5 MB without crashing the composer.",
              isCurrent: false
            })
          ]
        }),
        messageList(h, {
          label: "Activity",
          children: [
            divider(h, "Activity", { align: "start" }),
            event(h, { key: "created", text: "AJ created this task · 10:06 AM" }),
            message(h, {
              key: "reproduced",
              mark: "S",
              author: "Sara",
              time: "10:09 AM",
              text: "I can reproduce it. I'm checking the image size handling before the paste completes."
            }),
            message(h, {
              key: "preview",
              mark: "Y",
              author: "Yumi",
              time: "10:12 AM",
              text: "The crash starts when the preview is generated. I've added the reproduction steps."
            })
          ]
        })
      ])
    ],
    footer: [
      composer(h, {
        id: "task-reply",
        label: "Reply in thread",
        placeholder: "Reply in thread",
        value: model.reply,
        onInput: (value) => Message.TypedReply({ value }),
        onSubmit: press,
        submitLabel: "Send"
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

const nameSavedConfirmation = (h: ApplicationViewBuilder): Html =>
  confirmation(h, { key: "name-saved", text: "Name saved" })

const joinedConfirmation = (h: ApplicationViewBuilder): Html =>
  confirmation(h, {
    key: "joined",
    text: "Joined #launches",
    action: { label: "Open", onClick: Message.ClickedButton() }
  })

const longConfirmation = (h: ApplicationViewBuilder): Html =>
  confirmation(h, {
    key: "long",
    text: "Casey Morgan was removed from Mercier & Co, and the conversations they started stay where they are",
    action: { label: "Undo", onClick: Message.ClickedButton() }
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
      "Properties that are read and not changed: the captions in capitals over the values, in the look of the quiet button, 3px in",
      [
        properties(h, {
          label: "Task",
          children: [
            property(h, {
              caption: "Status",
              children: [propertyValue(h, { before: taskStatus(h, "progress"), text: "In progress" })]
            }),
            property(h, {
              caption: "Assignee",
              children: [propertyValue(h, { before: mark(h, { text: "AM", size: "sm" }), text: "Alex Morgan" })]
            }),
            property(h, {
              caption: "Assignee",
              children: [propertyValue(h, { before: propertyIcon(h, "users"), text: "Unassigned" })]
            }),
            property(h, { caption: "Priority", children: [propertyValue(h, { text: "No priority" })] })
          ]
        })
      ],
      sidePaneColumn
    ),
    sample(
      h,
      "Where an agent is at work: the logo as its turn goes, the state in quiet text, then the place",
      [
        activityList(h, {
          label: "Current activity",
          lines: [
            { key: "working", state: "Working", motion: "working", place: "#general" },
            { key: "queued", state: "Queued", motion: "thread", place: "#design" },
            { key: "stopping", state: "Stopping", motion: "tug", place: "Jamie Morgan" }
          ]
        })
      ],
      sidePaneColumn
    ),
    sample(
      h,
      "Each place a button that opens the turn's thread: 6px wider than its words each side, filled on hover, with the focus ring inside it",
      [
        activityList(h, {
          label: "Turns under way",
          lines: [
            {
              key: "working",
              state: "Working",
              motion: "working",
              place: "#general",
              action: { name: "Working in #general: open its log", onClick: Message.ClickedButton() }
            },
            {
              key: "queued",
              state: "Queued",
              motion: "thread",
              place: "#design",
              action: { name: "Queued in #design: open its log", onClick: Message.ClickedButton() }
            },
            {
              key: "stopping",
              state: "Stopping",
              motion: "tug",
              action: { name: "Stopping: open its log", onClick: Message.ClickedButton() }
            }
          ]
        })
      ],
      sidePaneColumn
    ),
    sample(
      h,
      "A person: a mark beside a name over what they are, at 40px, in the agent's tone, and at 24px with a name alone",
      [
        person(h, { mark: { text: "JM" }, name: "Jamie Morgan · You", detail: "Workspace owner" }),
        person(h, { mark: { text: "Y", tone: "lilac" }, name: "Yumi", detail: "Agent · Active" }),
        person(h, { mark: { text: "JM" }, markSize: "sm", name: "Jamie Morgan" })
      ],
      sampleStack
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
      "Where a turn stands: the logo moving while it is queued (thread), working, and stopping (tug), and a still mark once it is done, failed, or stopped",
      turnStates.map((state) => turnStatus(h, state)),
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
      "A stack of two",
      [h.div([h.Class(toastFrame)], [toastStack(h, [renameRefusal(h), postRefusal(h)])])],
      "flex flex-col"
    ),
    sample(
      h,
      "A confirmation, centered at the bottom with a check before its words, a status and not an alert, with no Dismiss",
      [h.div([h.Class(toastFrame)], [confirmationStack(h, [nameSavedConfirmation(h)])])],
      "flex flex-col"
    ),
    sample(
      h,
      "A confirmation with its one action, which runs it and takes the confirmation away",
      [h.div([h.Class(toastFrame)], [confirmationStack(h, [joinedConfirmation(h)])])],
      "flex flex-col"
    ),
    sample(
      h,
      "A long confirmation wraps within 28rem, its action beside it",
      [h.div([h.Class(toastFrame)], [confirmationStack(h, [longConfirmation(h)])])],
      "flex flex-col"
    ),
    sample(
      h,
      "A stack of two confirmations, the newest at the bottom, 8px apart",
      [h.div([h.Class(toastFrame)], [confirmationStack(h, [nameSavedConfirmation(h), joinedConfirmation(h)])])],
      "flex flex-col"
    ),
    sample(
      h,
      "A refusal in the bottom end corner and a confirmation at the bottom: side by side in a wide window, and, as in this narrow frame, the confirmation over the refusal until it goes",
      [
        h.div([h.Class(toastFrame)], [toastStack(h, [renameRefusal(h)]), confirmationStack(h, [joinedConfirmation(h)])])
      ],
      "flex flex-col"
    )
  ])

const groupNameField = (
  h: ApplicationViewBuilder,
  id: string,
  model: Model,
  render: Pick<RenderInfo, "initialFocus">
): Html =>
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
    closeLabel: "Close settings",
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
          count: model.heldMembers.length + 1,
          isCurrent: model.modalTab === "members",
          onClick: Message.ChangedModalTab({ tab: "members" })
        }
      ]
    }),
    body:
      model.modalTab === "general"
        ? [
            groupNameField(h, "settings-modal-group-name", model, render),
            groupPrivateToggle(h, "settings-modal-group-private", model)
          ]
        : membersTab(h, model),
    ...(model.modalTab === "general"
      ? { cancelLabel: "Cancel", footer: [submit(h, "Save changes")] }
      : { leading: [button(h, "Invite people", Message.ClickedButton())], cancelLabel: "Done" }),
    onSubmit: Message.SubmittedSettingsModal()
  })

const confirmModal = (h: ApplicationViewBuilder, render: RenderInfo): Html =>
  modal(h, render, {
    title: "Remove connection?",
    context: "Search tools",
    description: "Search tools will be removed from the workspace, along with its saved key.",
    body: [],
    cancelLabel: "Cancel",
    isCancelLeading: true,
    footer: [submit(h, "Remove connection")],
    onSubmit: Message.SubmittedConfirmModal(),
    size: "compact"
  })

const compactModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html =>
  modal(h, render, {
    title: "Your name",
    context: "Mercier & Co",
    description: "What people in this workspace call you. Others keep their own.",
    body: [
      field(
        h,
        {
          id: "modal-own-name",
          label: "Name",
          type: "text",
          value: model.fullName,
          isAutofocus: false,
          isDisabled: model.isNameSending,
          attributes: render.initialFocus,
          onInput: (value) => Message.TypedFullName({ value })
        },
        Option.none()
      ),
      toggle(h, {
        id: "modal-name-sending",
        label: "The request is on its way",
        isOn: model.isNameSending,
        onToggle: (isOn) => Message.ToggledNameSending({ isOn })
      })
    ],
    cancelLabel: "Cancel",
    isCancelDisabled: model.isNameSending,
    footer: [submit(h, model.isNameSending ? "Saving…" : "Save name", { isDisabled: model.isNameSending })],
    onSubmit: Message.SubmittedCompactModal(),
    size: "compact"
  })

const formModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html =>
  modal(h, render, {
    title: "Configure connection",
    context: "Mercier & Co",
    description: "Name the connection and give the key it signs in with.",
    body: [
      field(
        h,
        {
          id: "form-modal-connection-name",
          label: "Name",
          type: "text",
          value: model.connectionName,
          isAutofocus: false,
          attributes: render.initialFocus,
          onInput: (value) => Message.TypedConnectionName({ value })
        },
        Option.none()
      ),
      field(
        h,
        {
          id: "form-modal-connection-key",
          label: "API key",
          type: "password",
          value: model.connectionKey,
          hint: "Kept encrypted. Only the last four characters show again.",
          isAutofocus: false,
          onInput: (value) => Message.TypedConnectionKey({ value })
        },
        Option.none()
      )
    ],
    leading: [button(h, "Back", Message.ClickedButton())],
    cancelLabel: "Cancel",
    footer: [submit(h, "Create connection")],
    onSubmit: Message.SubmittedFormModal(),
    size: "form"
  })

const wideModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html =>
  modal(h, render, {
    title: "Add agent",
    context: "Mercier & Co",
    description: "Name the agent, say what it is for, and tell it how to work.",
    body: [
      fieldGrid(h, [
        field(
          h,
          {
            id: "wide-modal-agent-name",
            label: "Name",
            type: "text",
            value: model.agentName,
            isAutofocus: false,
            attributes: render.initialFocus,
            onInput: (value) => Message.TypedAgentName({ value })
          },
          Option.none()
        ),
        field(
          h,
          {
            id: "wide-modal-agent-role",
            label: "Role",
            type: "text",
            value: model.agentRole,
            placeholder: "e.g. Reviewer",
            isAutofocus: false,
            onInput: (value) => Message.TypedAgentRole({ value })
          },
          Option.none()
        )
      ]),
      textarea(h, {
        id: "wide-modal-agent-instructions",
        label: "Instructions",
        value: model.agentInstructions,
        rows: 8,
        hint: "Sent to the model at the start of every turn.",
        onInput: (value) => Message.TypedAgentInstructions({ value })
      })
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, "Add agent", { isDisabled: model.agentName.trim() === "" })],
    onSubmit: Message.SubmittedWideModal(),
    size: "wide"
  })

type PalettePlace = Omit<PaletteItem<Message>, "isActive" | "onClick">

type PalettePlaces = Readonly<{ title: string; items: ReadonlyArray<PalettePlace> }>

const palettePlaces: ReadonlyArray<PalettePlaces> = [
  {
    title: "Go to",
    items: [
      { id: "workshop-palette-inbox", label: "Inbox", leading: { icon: "mark-mail" } },
      { id: "workshop-palette-agents", label: "Agents", leading: { icon: "mark-agents" } },
      { id: "workshop-palette-connections", label: "Connections", leading: { icon: "mark-connections" } },
      { id: "workshop-palette-settings", label: "Settings", leading: { icon: "mark-settings" } }
    ]
  },
  {
    title: "Groups",
    items: ["general", "design", "engineering", "product"].map((name) => ({
      id: `workshop-palette-group-${name}`,
      label: name,
      leading: { icon: "mark-channel" }
    }))
  },
  {
    title: "People",
    items: [
      { id: "workshop-palette-person-alex", label: "Alex Morgan", detail: "Direct message", leading: { text: "AM" } },
      { id: "workshop-palette-person-sara", label: "Sara Lind", detail: "Direct message", leading: { text: "SL" } },
      { id: "workshop-palette-person-oliver", label: "Oliver Dean", detail: "Direct message", leading: { text: "OD" } }
    ]
  },
  {
    title: "Agents",
    items: [{ id: "workshop-palette-agent-yumi", label: "Yumi", leading: { text: "Y", tone: "lilac" } }]
  }
]

/** The places whose names contain what is typed, a section at a time, and none of a section that has none. */
const placesNamed = (query: string): ReadonlyArray<PalettePlaces> => {
  const wanted = query.trim().toLowerCase()

  return palettePlaces
    .map(({ title, items }) => ({ title, items: items.filter(({ label }) => label.toLowerCase().includes(wanted)) }))
    .filter(({ items }) => items.length > 0)
}

/** The places as the palette lists them, the one at `activeIndex` among them all reached, and each picking itself. */
const paletteSectionsOf = (
  places: ReadonlyArray<PalettePlaces>,
  activeIndex: number
): ReadonlyArray<PaletteSection<Message>> => {
  const activeId = places.flatMap(({ items }) => items).at(activeIndex)?.id

  return places.map(({ title, items }) => ({
    title,
    items: items.map((place) => ({ ...place, isActive: place.id === activeId, onClick: Message.PickedPaletteItem() }))
  }))
}

/**
 * What the arrow keys and Enter do in the palette's field: move through the places, wrapping, or pick the one reached.
 */
const answerPaletteKey = (key: string, count: number, activeIndex: number): Option.Option<Message> => {
  if (count === 0) {
    return Option.none()
  }

  if (key === "ArrowDown") {
    return Option.some(Message.MovedPaletteActive({ to: (activeIndex + 1) % count }))
  }

  if (key === "ArrowUp") {
    return Option.some(Message.MovedPaletteActive({ to: (activeIndex + count - 1) % count }))
  }

  return key === "Enter" ? Option.some(Message.PickedPaletteItem()) : Option.none()
}

const paletteOf = (h: ApplicationViewBuilder, render: ApplicationModalRender, model: Model): Html => {
  const places = placesNamed(model.paletteQuery)
  const count = places.flatMap(({ items }) => items).length
  const activeId = places.flatMap(({ items }) => items).at(model.paletteActive)?.id

  return palette(h, render, {
    label: "Jump to",
    id: "workshop-palette",
    placeholder: "Jump to a group, person, or page…",
    query: model.paletteQuery,
    onInput: (value) => Message.TypedPaletteQuery({ value }),
    attributes: [
      ...render.initialFocus,
      answerKeys(h, (key) => answerPaletteKey(key, count, model.paletteActive)),
      ...(activeId === undefined ? [] : [h.AriaActiveDescendant(activeId)])
    ],
    sections: paletteSectionsOf(places, model.paletteActive),
    emptyText: `Nothing matches "${model.paletteQuery.trim()}".`
  })
}

type IntegrationSample = Readonly<{ name: string; detail: string }>

const integrationSamples: ReadonlyArray<IntegrationSample> = [
  { name: "Anthropic", detail: "Models · API key" },
  { name: "MCP server", detail: "Tools · API key or no authentication" },
  { name: "Daytona", detail: "Sandboxes · API key" }
]

const chooserModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html => {
  const words = model.integrationQuery.trim().toLowerCase()

  return modal(h, render, {
    title: "Add connection",
    context: "Mercier & Co",
    body: [
      field(
        h,
        {
          id: "modal-integration-search",
          label: "Search integrations",
          type: "search",
          value: model.integrationQuery,
          placeholder: "Search integrations…",
          isAutofocus: false,
          isLabelHidden: true,
          attributes: render.initialFocus,
          onInput: (value) => Message.TypedIntegrationQuery({ value })
        },
        Option.none()
      ),
      modalList(
        h,
        "Integrations",
        integrationSamples
          .filter(({ name }) => words === "" || name.toLowerCase().includes(words))
          .map(({ name, detail }) =>
            row(h, {
              mark: { icon: "mark-connections" },
              markSize: "md",
              title: name,
              meta: detail,
              onClick: Message.PickedIntegration()
            })
          )
      )
    ],
    cancelLabel: "Cancel"
  })
}

const pickerPeople: ReadonlyArray<PickerPerson> = [
  { id: "alex", name: "Alex Morgan", mark: { text: "AM" }, kind: "Person" },
  { id: "caleb", name: "Caleb", mark: { text: "C" }, kind: "Person" },
  { id: "graeme", name: "Graeme", mark: { text: "G" }, kind: "Person" },
  { id: "oliver", name: "Oliver", mark: { text: "O" }, kind: "Person" },
  { id: "sara", name: "Sara", mark: { text: "S" }, kind: "Person" },
  { id: "yumi", name: "Yumi", mark: { text: "Y", tone: "lilac" }, kind: "Agent" }
]

const youPerson: PickerPerson = { id: "you", name: "You", mark: { text: "JM" }, kind: "Person" }

/** The people of the picker whose IDs are `ids`, in that order. */
const peopleOf = (ids: ReadonlyArray<string>): ReadonlyArray<PickerPerson> =>
  ids.flatMap((id) => pickerPeople.filter((person) => person.id === id))

const visibilityChoices: ReadonlyArray<readonly [Visibility, string]> = [
  ["Public", "Public"],
  ["Private", "Private"]
]

const visibilityHints: Readonly<Record<Visibility, string>> = {
  Public: "Anyone in the workspace can find this group and join it.",
  Private: "Only people added to this group can find it."
}

const membersHint = (chosen: number): string =>
  chosen === 0 ? "You're included automatically. Add others now or later." : `${chosen + 1} members, including you.`

const emptyMemberPicker = (h: ApplicationViewBuilder, model: Model): Html =>
  memberPicker(h, {
    id: "workshop-empty-picker",
    label: "Add members",
    chosen: peopleOf(model.emptyMembers),
    candidates: pickerPeople,
    query: model.emptyPicker.inputValue,
    isOpen: model.emptyPicker.isOpen,
    onRemove: (id) => Message.ClickedRemoveMember({ place: "empty", id }),
    embed: (viewInputs) =>
      h.block(EmptyPickerBinding.embedView({ slotId: "empty-picker", model: model.emptyPicker, viewInputs }))
  })

const chosenMemberPicker = (h: ApplicationViewBuilder, model: Model): Html =>
  memberPicker(h, {
    id: "workshop-chosen-picker",
    label: "Members",
    locked: [youPerson],
    chosen: peopleOf(model.chosenMembers),
    candidates: pickerPeople,
    query: model.chosenPicker.inputValue,
    isOpen: model.chosenPicker.isOpen,
    hint: membersHint(model.chosenMembers.length),
    onRemove: (id) => Message.ClickedRemoveMember({ place: "chosen", id }),
    embed: (viewInputs) =>
      h.block(ChosenPickerBinding.embedView({ slotId: "chosen-picker", model: model.chosenPicker, viewInputs }))
  })

const visibilityRadioGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  choiceGroup(h, {
    id: "workshop-visibility",
    label: "Visibility",
    choices: visibilityChoices,
    value: model.visibility,
    hint: visibilityHints[model.visibility],
    embed: (viewInputs) =>
      h.block(VisibilityBinding.embedView({ slotId: "visibility", model: model.visibilityGroup, viewInputs }))
  })

const lockedVisibilityRadioGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  choiceGroup(h, {
    id: "workshop-locked-visibility",
    label: "Visibility",
    choices: visibilityChoices,
    value: model.visibility,
    hint: "Only the owner can change this.",
    isDisabled: true,
    embed: (viewInputs) =>
      h.block(
        LockedVisibilityBinding.embedView({
          slotId: "locked-visibility",
          model: model.lockedVisibilityGroup,
          viewInputs
        })
      )
  })

const createGroupModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html =>
  modal(h, render, {
    title: "Create group",
    description: "Set a name, visibility, and members.",
    body: [
      field(
        h,
        {
          id: "create-group-name",
          label: "Group name",
          type: "text",
          value: model.newGroupName,
          placeholder: "e.g. release-planning",
          maxLength: 80,
          isAutofocus: false,
          attributes: render.initialFocus,
          onInput: (value) => Message.TypedNewGroupName({ value })
        },
        Option.none()
      ),
      choiceGroup(h, {
        id: "workshop-create-visibility",
        label: "Visibility",
        choices: visibilityChoices,
        value: model.visibility,
        hint: visibilityHints[model.visibility],
        embed: (viewInputs) =>
          h.block(
            CreateVisibilityBinding.embedView({
              slotId: "create-visibility",
              model: model.createVisibilityGroup,
              viewInputs
            })
          )
      }),
      memberPicker(h, {
        id: "workshop-create-picker",
        label: "Members",
        locked: [youPerson],
        chosen: peopleOf(model.createMembers),
        candidates: pickerPeople,
        query: model.createPicker.inputValue,
        isOpen: model.createPicker.isOpen,
        hint: membersHint(model.createMembers.length),
        onRemove: (id) => Message.ClickedRemoveMember({ place: "create", id }),
        embed: (viewInputs) =>
          h.block(CreatePickerBinding.embedView({ slotId: "create-picker", model: model.createPicker, viewInputs }))
      })
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, "Create group", { isDisabled: model.newGroupName.trim() === "" })],
    onSubmit: Message.SubmittedCreateModal()
  })

/** The people a group holds, as the settings' Members tab lists them: the reader first, then who was added. */
const heldMembers = (model: Model): ReadonlyArray<GroupMember<Message>> => [
  { key: "you", name: "Jamie Morgan", mark: { text: "JM" }, note: "You" },
  ...peopleOf(model.heldMembers).map((person): GroupMember<Message> => ({
    key: person.id,
    name: person.name,
    mark: person.mark,
    ...(person.kind === "Agent" ? { note: "Agent" } : {}),
    action: {
      label: "Remove",
      name: `Remove ${person.name}`,
      onClick: Message.ClickedRemoveHeldMember({ id: person.id })
    }
  }))
]

const addMembersLabel = (chosen: number): string => (chosen > 0 ? `Add ${chosen}` : "Add")

const membersTab = (h: ApplicationViewBuilder, model: Model): ReadonlyArray<Html> => {
  const held = heldMembers(model)

  return [
    memberPicker(h, {
      id: "workshop-add-picker",
      label: "Add members",
      chosen: peopleOf(model.addMembers),
      candidates: pickerPeople.filter(({ id }) => !model.heldMembers.includes(id)),
      query: model.addPicker.inputValue,
      isOpen: model.addPicker.isOpen,
      action: button(h, addMembersLabel(model.addMembers.length), Message.ClickedAddMembers(), {
        variant: model.addMembers.length > 0 ? "primary" : "secondary",
        wide: true,
        isDisabled: model.addMembers.length === 0
      }),
      onRemove: (id) => Message.ClickedRemoveMember({ place: "add", id }),
      embed: (viewInputs) =>
        h.block(AddPickerBinding.embedView({ slotId: "add-picker", model: model.addPicker, viewInputs }))
    }),
    memberCount(h, held.length),
    groupMemberList(h, { label: "Members", members: held })
  ]
}

const memberPickerListSample = (h: ApplicationViewBuilder, model: Model, id: string): Html =>
  memberPickerList(h, {
    id,
    label: "Search workspace members",
    chosen: peopleOf(model.listMembers),
    candidates: pickerPeople,
    query: model.listQuery,
    onQuery: (value) => Message.TypedMemberListQuery({ value }),
    onPick: (id) => Message.PickedListMember({ id }),
    onRemove: (id) => Message.ClickedRemoveMember({ place: "list", id })
  })

const addViewLabel = (count: number) =>
  count === 0 ? "Add members" : count === 1 ? "Add 1 member" : `Add ${count} members`

/** The view a phone's settings move to for adding members: Back in place of Close, the list always shown. */
const addViewModal = (h: ApplicationViewBuilder, render: RenderInfo, model: Model): Html =>
  modal(h, render, {
    title: "Add members",
    context: "# general",
    back: { label: "Back to members", onClick: Message.ClickedCloseAddViewModal() },
    body: [memberPickerListSample(h, model, "workshop-add-view-search")],
    footer: [
      button(h, addViewLabel(model.listMembers.length), Message.SubmittedAddViewModal(), {
        variant: "primary",
        wide: true,
        isDisabled: model.listMembers.length === 0
      })
    ]
  })

const membersColumn = "flex max-w-md flex-col gap-4"

const membersGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  group(h, "Members", [
    sample(
      h,
      "A members picker, empty: the search mark and the placeholder, the list opening as it takes focus",
      [emptyMemberPicker(h, model)],
      membersColumn
    ),
    sample(
      h,
      "With the person locked as You, two chosen, and a hint under it that counts them",
      [chosenMemberPicker(h, model)],
      membersColumn
    ),
    sample(
      h,
      "The people a group holds: how many, before a dashed rule, then each with their mark, You or Agent beside their name, and Remove",
      [memberCount(h, 3), groupMemberList(h, { label: "Group members", members: heldMembers(model) })],
      membersColumn
    ),
    sample(
      h,
      "A group of one",
      [
        memberCount(h, 1),
        groupMemberList(h, {
          label: "Only member",
          members: [{ key: "you", name: "Jamie Morgan", mark: { text: "JM" }, note: "You" }]
        })
      ],
      membersColumn
    ),
    sample(
      h,
      "The same field with its list always shown under it, for a phone, where a list that opens over the form has no room",
      [memberPickerListSample(h, model, "workshop-list-search")],
      membersColumn
    ),
    sample(
      h,
      "Visibility: one choice among boxed options, with what the chosen one means under them",
      [visibilityRadioGroup(h, model)],
      membersColumn
    ),
    sample(
      h,
      "Visibility that no one can change, its choices dimmed",
      [lockedVisibilityRadioGroup(h, model)],
      membersColumn
    )
  ])

/**
 * The `frame` that the workshop is opened with to show a regular modal alone, as a phone shows it. A modal fills the
 * window below 48rem, which only a window of that width shows, so it is shown in a frame that is a window of its own,
 * 360px wide.
 */
export const phoneModalFrame = "phone-modal"

/** The `frame` that the workshop is opened with to show the palette alone, as a phone shows it. */
export const phonePaletteFrame = "phone-palette"

const phoneModalSample = (h: ApplicationViewBuilder): Html =>
  sample(
    h,
    "Below 48rem every modal fills the window, in a frame 360px wide: no shadow, below the safe area at the top, and the footer's buttons sharing its width. The palette fills it too, with no keys to show",
    [
      h.iframe([
        h.Class(phoneWindowFrame),
        h.Title("Regular modal in a window 360px wide"),
        h.Src(`?frame=${phoneModalFrame}`)
      ]),
      h.iframe([
        h.Class(phoneWindowFrame),
        h.Title("Palette in a window 360px wide"),
        h.Src(`?frame=${phonePaletteFrame}`)
      ])
    ],
    "flex flex-wrap items-start gap-6"
  )

const modalGroup = (h: ApplicationViewBuilder, model: Model): Html =>
  group(h, "Modal", [
    sample(
      h,
      "Regular, the default, 40rem by 37.5rem: a context, a field with the initial focus, a toggle, and a footer whose Cancel is a secondary button, bordered as the action beside it is",
      [
        button(h, "Open the modal", Message.ClickedOpenModal()),
        h.block(
          ModalBinding.embedView({
            slotId: "modal",
            model: model.modal,
            viewInputs: { toView: (render) => renameModal(h, render, model) }
          })
        )
      ]
    ),
    sample(
      h,
      "Regular, with a description, a field with a placeholder, a choice, and a members picker with the person locked; its action waits for a name",
      [
        button(h, "Open the create group modal", Message.ClickedOpenCreateModal()),
        h.block(
          CreateModalBinding.embedView({
            slotId: "create-modal",
            model: model.createModal,
            viewInputs: { hasDescription: true, toView: (render) => createGroupModal(h, render, model) }
          })
        )
      ]
    ),
    sample(
      h,
      "Regular, a view the modal moved to, with Back before the title in place of Close, the list of people always shown, and a wide action",
      [
        button(h, "Open the add members view", Message.ClickedOpenAddViewModal()),
        h.block(
          AddViewModalBinding.embedView({
            slotId: "add-view-modal",
            model: model.addViewModal,
            viewInputs: { toView: (render) => addViewModal(h, render, model) }
          })
        )
      ]
    ),
    sample(
      h,
      "Regular, with tabs and a description; on Members, an action at the start of the footer and Done at its end",
      [
        button(h, "Open the settings modal", Message.ClickedOpenSettingsModal()),
        h.block(
          SettingsModalBinding.embedView({
            slotId: "settings-modal",
            model: model.settingsModal,
            viewInputs: { hasDescription: true, toView: (render) => settingsModal(h, render, model) }
          })
        )
      ]
    ),
    sample(
      h,
      "Compact, 35rem wide and as tall as its content: a confirmation, with Cancel at the start of the footer and the primary action at its end",
      [
        button(h, "Open the confirmation", Message.ClickedOpenConfirmModal()),
        h.block(
          ConfirmModalBinding.embedView({
            slotId: "confirm-modal",
            model: model.confirmModal,
            viewInputs: { hasDescription: true, toView: (render) => confirmModal(h, render) }
          })
        )
      ]
    ),
    sample(h, "Compact, with a description; while its request is on its way, Cancel and the action are dimmed", [
      button(h, "Open the compact modal", Message.ClickedOpenCompactModal()),
      h.block(
        CompactModalBinding.embedView({
          slotId: "compact-modal",
          model: model.compactModal,
          viewInputs: { hasDescription: true, toView: (render) => compactModal(h, render, model) }
        })
      )
    ]),
    sample(
      h,
      "Form, 40rem wide and as tall as its content: two fields, a hint, a control at the start of the footer, and Cancel and the action at its end",
      [
        button(h, "Open the form modal", Message.ClickedOpenFormModal()),
        h.block(
          FormModalBinding.embedView({
            slotId: "form-modal",
            model: model.formModal,
            viewInputs: { hasDescription: true, toView: (render) => formModal(h, render, model) }
          })
        )
      ]
    ),
    sample(h, "Wide, 45rem by 54rem: fields side by side over a taller box; its action waits for a name", [
      button(h, "Open the wide modal", Message.ClickedOpenWideModal()),
      h.block(
        WideModalBinding.embedView({
          slotId: "wide-modal",
          model: model.wideModal,
          viewInputs: { hasDescription: true, toView: (render) => wideModal(h, render, model) }
        })
      )
    ]),
    sample(h, "Regular, a search over rows that run to the panel's edges", [
      button(h, "Open the chooser", Message.ClickedOpenChooserModal()),
      h.block(
        ChooserModalBinding.embedView({
          slotId: "chooser-modal",
          model: model.chooserModal,
          viewInputs: { toView: (render) => chooserModal(h, render, model) }
        })
      )
    ]),
    sample(
      h,
      "Palette, 40rem by 30rem near the top of the window, with no title: the field and Close, the places under the title of their section, the one reached filled, and the keys; the arrow keys move, Enter picks, and what matches nothing says so",
      [
        button(h, "Open the palette", Message.ClickedOpenPaletteModal()),
        h.block(
          PaletteModalBinding.embedView({
            slotId: "palette-modal",
            model: model.paletteModal,
            viewInputs: { toView: (render) => paletteOf(h, render, model) }
          })
        )
      ]
    ),
    phoneModalSample(h)
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
              rail: shellRail(h, model.destination, model),
              sidebar: shellSidebar(h, true, false),
              main: groupPane(h, model.paneTab, model.composer),
              aside: { label: "Thread", view: threadPane(h, model.reply), isOpen: false, dialog: () => h.empty }
            })
          ]
        )
      ],
      "flex flex-col"
    ),
    sample(
      h,
      "A task in the side pane on the Tasks tab: its status drawn before the title, Close task, the status, assignee, and priority as quiet menus under their captions, the description, and the activity over the replies",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              viewport: "Split",
              rail: shellRail(h, model.destination),
              sidebar: shellSidebar(h, true, false),
              main: groupPane(h, "tasks", model.composer),
              aside: { label: "Task", view: taskPane(h, model), isOpen: false, dialog: () => h.empty }
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
      "Settings, Members: a search and a filter over a table of members, the member open beside it as the side pane, and the pending invitations under the table",
      [
        h.div(
          [h.Class(shellFrame)],
          [
            shell(h, {
              viewport: "Split",
              rail: shellRail(h, "settings"),
              sidebar: settingsSidebar(h),
              main: membersPane(h, model),
              aside: { label: "Member details", view: memberPane(h), isOpen: false, dialog: () => h.empty }
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
          menuGroup(h, model),
          noticeGroup(h),
          toastGroup(h),
          modalGroup(h, model),
          membersGroup(h, model),
          iconGroup(h),
          logoGroup(h),
          markGroup(h),
          tooltipGroup(h),
          detailsGroup(h, model),
          messageGroup(h, model.openThread, model.editText),
          richTextGroup(h),
          paneEmptyGroup(h),
          stateArtGroup(h),
          loadingGroup(h),
          codeInputGroup(h, model.code),
          composerGroup(h, model.draft, model.filledDraft),
          formGroup(h, model.taskStatus),
          directoryGroup(h),
          centeredGroup(h, model.signInEmail, model.code)
        ]
      ),
      h.div(
        [h.Class(wideColumn)],
        [
          directoryTableGroup(h),
          paneToolbarGroup(h, model),
          taskListGroup(h),
          paneColumnGroup(h, model.workspaceName),
          shellGroup(h, model)
        ]
      )
    ]
  )
}))

export const listPaneView = ApplicationComposition.makeView((model, h) => ({
  title: "amends design workshop: list pane",
  body: h.div([h.Class("flex h-dvh flex-col")], [taskListPane(h, model)])
}))

export const directoryTableView = ApplicationComposition.makeView((_model, h) => ({
  title: "amends design workshop: directory table",
  body: h.div([h.Class(tableFrameBody)], groupTable(h))
}))

/**
 * What an open dialog publishes, for a modal shown in a frame without the dialog that opens it: the dialog open and
 * filling the frame, as the headless dialog's element does, and no attribute in any other group.
 */
const openDialogRender = (h: ApplicationViewBuilder): ApplicationModalRender => ({
  dialog: [h.Open(true), h.Style({ position: "fixed", inset: "0", width: "100%", height: "100%" })],
  backdrop: [],
  panel: [],
  title: [],
  description: [],
  initialFocus: [],
  closeButton: [],
  isVisible: true
})

export const phoneModalView = ApplicationComposition.makeView((model, h) => ({
  title: "amends design workshop: modal on a phone",
  body: modal(h, openDialogRender(h), {
    title: "Rename group",
    context: "# general",
    body: [
      groupNameField(h, "phone-modal-group-name", model, { initialFocus: [] }),
      groupPrivateToggle(h, "phone-modal-group-private", model)
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, "Save changes")],
    onSubmit: Message.SubmittedModal()
  })
}))

export const phonePaletteView = ApplicationComposition.makeView((model, h) => ({
  title: "amends design workshop: palette on a phone",
  body: paletteOf(h, openDialogRender(h), model)
}))

import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { centered, copy, heading, screenContent } from "../src/centered.ts"
import { composer } from "../src/composer.ts"
import {
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  fieldGrid,
  hint,
  iconButton,
  notice,
  sending,
  submit,
  textarea,
  toggle
} from "../src/control.ts"
import { badge, detailList, entry, entryList, log } from "../src/details.ts"
import { row, section } from "../src/directory.ts"
import { form, inline, settingRow, valueWithAction } from "../src/form.ts"
import { type IconName, icon } from "../src/icon.ts"
import { mark } from "../src/mark.ts"
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

const emptyPaneFrame = "flex h-96 flex-col outline outline-outline"

const sidePaneColumn = "flex w-98 flex-col"

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

const taskAssigneeChoices: ReadonlyArray<readonly [TaskAssignee, string]> = [
  ["", "No one"],
  ["alex", "Alex Morgan"],
  ["yumi", "Yumi"]
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
      screenContent(h, [
        heading(h, "Choose a workspace"),
        copy(h, `${workspaces.length} workspaces`),
        section(h, { label: "Your workspaces", count: workspaces.length }),
        workspaceList(h)
      ])
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

const markGroup = (h: ApplicationViewBuilder): Html =>
  group(h, "Marks", [
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
    )
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
      "Notifications under their days: unread, with a dot and a quiet action, and read",
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
              onOpen: press,
              actions: [button(h, "Mark seen", press, { variant: "quiet" })]
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
                sidebarItem(h, { mark: "AM", label: "Alex Morgan", isCurrent: false, onClick: press }),
                sidebarItem(h, { mark: "Y", label: "Yumi", isCurrent: false, onClick: press })
              ]
        })
      ])
    ],
    footer: sidebarFooter(h, [hint(h, "12 members · as Alex")])
  })
}

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
      "Without the side pane: a page about one item, a section with no items, and notices",
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
      h.div([h.Class(wideColumn)], [shellGroup(h, model)])
    ]
  )
}))

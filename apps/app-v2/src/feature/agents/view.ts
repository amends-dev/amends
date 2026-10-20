import { Agent } from "@amends-dev/core/agent"
import type { Identity } from "@amends-dev/core/identity"
import {
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  hint,
  iconButton,
  notice,
  noticeBox,
  submit
} from "@amends-dev/design/control"
import { detailList } from "@amends-dev/design/details"
import { cellWithDetail, columns, row } from "@amends-dev/design/directory"
import { form } from "@amends-dev/design/form"
import type { MarkStatus } from "@amends-dev/design/mark"
import { pane, paneColumn, paneEmpty, paneForm, paneSection, paneTabs } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { calendarDate, memberName } from "../../seen.ts"
import { connectionItemsGiving, Integrations } from "../connections/definition.ts"
import { givableRoles } from "../settings/definition.ts"
import { AgentsComposition, type AgentsViewBuilder } from "./composition.ts"
import {
  type Adding,
  type AgentAction,
  type AgentItem,
  type BrowseTab,
  connectionName,
  type Edit,
  failureMessage,
  findEdit,
  findListedAgent,
  isNameChanged,
  isSetupChanged,
  listedAgents,
  mayAdd,
  mayConfigure,
  mayCreate,
  Message,
  type Model,
  nameDraftOf,
  nameOfAgent,
  needsSetup,
  problemsOf,
  SetupTarget,
  setupDraftOf,
  shownAgents
} from "./definition.ts"
import { setupFields } from "./setupFields.ts"

/** Why an agent can't run, as a sentence. */
const issueSentence = (issue: Agent.Issue): string =>
  Agent.Issue.match(issue, {
    Removed: ({ part }) => `Its ${part} connection was removed.`,
    Uninstalled: ({ part }) => `Its ${part} connection's integration isn't installed on this host.`,
    Invalid: ({ description }) => (description.endsWith(".") ? description : `${description}.`),
    SandboxRequired: () => "Its harness works only in a sandbox, and it has none.",
    NoHarness: () => "No connection gives a harness it can run on."
  })

/**
 * How an agent stands, as the patch on its mark says it: Needs setup, with why on hover, when it can't run as it
 * is set up. A ready agent shows nothing, and so does one still on its way, since the server tells how ready a new
 * agent is once it has it.
 */
const statusOf = ({ agent, pending }: AgentItem): MarkStatus | undefined =>
  pending
    ? undefined
    : Agent.Readiness.match(agent.readiness, {
        Ready: () => undefined,
        Incomplete: ({ issues }) => ({ kind: "attention", label: "Needs setup", detail: issueSentence(issues[0]) })
      })

/** The harness an agent runs on, as a line: `Auto`, or the connection's name. */
const harnessLine = (agent: AgentItem["agent"], model: Model): string =>
  Agent.Harness.match(agent.harness, {
    Auto: () => "Auto",
    Connection: ({ connectionId }) => connectionName(model, connectionId)
  })

/** Where an agent works, as a line: the sandbox connection's name, or "No sandbox". */
const sandboxLine = (agent: AgentItem["agent"], model: Model): string =>
  agent.sandbox === null ? "No sandbox" : connectionName(model, agent.sandbox.connectionId)

/** What the host's integrations say while the person waits for them, or why they could not be listed, with a way to ask again. */
const integrationsView = (model: Model, h: AgentsViewBuilder): Html =>
  Integrations.match(model.integrations, {
    Loading: () => hint(h, "Loading the integrations…"),
    Failed: ({ error }) =>
      column(h, [
        notice(h, Option.some(error)),
        buttonRow(h, [button(h, "Try again", Message.ClickedReloadIntegrations(), { variant: "quiet" })])
      ]),
    Loaded: () =>
      connectionItemsGiving(model, "models").length === 0
        ? hint(h, "An agent needs a connection that gives models.")
        : h.empty
  })

/**
 * Whether the list page, which the sidebar's title opens, is what the main content shows, and the agent whose page
 * it shows instead, if one.
 */
export type SidebarInputs = Readonly<{ isListOpen: boolean; openAgentId: Option.Option<Identity.AgentId> }>

/**
 * The sidebar's section of the agents: each by its name on a lilac mark with how it stands as a patch on it, Browse
 * to the list and, for a person who may add one, Add agent. The title opens the list and is current while it shows,
 * a row opens the page of its agent and is current while that shows. An empty section says so once the agents are
 * read.
 */
export const sidebarView = AgentsComposition.makeView.withInputs<SidebarInputs>(
  (model, { isListOpen, openAgentId }, h) => {
    const listed = listedAgents(model)

    return sidebarSections(h, [
      sidebarSection(h, {
        label: "Agents",
        onTitleClick: Message.ClickedBrowse(),
        isTitleCurrent: isListOpen,
        actions: [
          iconButton(
            h,
            { icon: "list", label: "Browse agents", onClick: Message.ClickedBrowse() },
            { size: "compact" }
          ),
          ...(mayAdd(model)
            ? [
                iconButton(
                  h,
                  { icon: "mark-new", label: "Add agent", onClick: Message.ClickedAdd() },
                  { size: "compact" }
                )
              ]
            : [])
        ],
        children:
          listed.length === 0 && model.isLoaded
            ? [sidebarEmpty(h, "No agents yet")]
            : listed.map((item) =>
                sidebarItem(h, {
                  mark: { text: nameOfAgent(model, item.agent).slice(0, 1), tone: "lilac" },
                  status: statusOf(item),
                  label: nameOfAgent(model, item.agent),
                  isPending: item.pending,
                  isCurrent: Option.contains(openAgentId, item.agent.id),
                  onClick: Message.ClickedAgent({ agentId: item.agent.id })
                })
              )
      })
    ])
  }
)

/**
 * An agent as a row of the list: its lilac mark with how it stands as a patch on it, its name, its harness over its
 * sandbox, its model over its connection, and, blank while it is idle, what it is at work on, which no turn tells yet.
 */
const agentRow = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html => {
  const { agent, pending } = item
  const name = nameOfAgent(model, agent)
  const harness = harnessLine(agent, model)
  const sandbox = sandboxLine(agent, model)
  const connection = connectionName(model, agent.model.connectionId)

  return h.keyed("li")(
    agent.id,
    [],
    [
      row(h, {
        mark: { text: name.slice(0, 1), tone: "lilac" },
        markSize: "md",
        status: statusOf(item),
        title: name,
        ...(pending ? { meta: "Sending…" } : {}),
        cells: [
          cellWithDetail(h, { value: harness, detail: sandbox }),
          cellWithDetail(h, { value: agent.model.id, detail: connection }),
          h.empty
        ],
        cellsText: [harness, sandbox, agent.model.id, connection].join(" · "),
        onClick: Message.ClickedAgent({ agentId: agent.id })
      })
    ]
  )
}

/** What the list says when it has no row to show: nothing is there to browse, nothing needs setup, or nothing matches. */
const emptyList = (model: Model, h: AgentsViewBuilder): Html => {
  const { tab, query } = model.browse

  if (query.trim() !== "") {
    return paneEmpty(h, {
      icon: "mark-search",
      title: `No agents match “${query.trim()}”.`,
      action: button(h, "Clear search", Message.TypedBrowseQuery({ query: "" }), { variant: "quiet" })
    })
  }

  return tab === "NeedsSetup"
    ? paneEmpty(h, { icon: "mark-done", title: "Every agent can run as it is set up." })
    : paneEmpty(h, { icon: "mark-agents", title: "No agents yet" })
}

/** The search over the agents, the labels of the columns, and a row for each agent shown. */
const agentList = (model: Model, h: AgentsViewBuilder): Html => {
  const shown = shownAgents(model)

  return column(h, [
    field(
      h,
      {
        id: "search-agents",
        label: "Search agents",
        type: "search",
        value: model.browse.query,
        onInput: (query) => Message.TypedBrowseQuery({ query }),
        placeholder: "Search agents…",
        isAutofocus: false,
        isLabelHidden: true
      },
      Option.none()
    ),
    ...(shown.length === 0
      ? [emptyList(model, h)]
      : [
          columns(h, { label: "Agent", cells: ["Harness", "Model", "Activity"] }),
          h.ul(
            [h.AriaLabel("Agents")],
            shown.map((item) => agentRow(item, model, h))
          )
        ])
  ])
}

/** What the list says when the workspace has no agent at all, and what a person who may add one can do about it. */
const noAgents = (model: Model, h: AgentsViewBuilder): Html =>
  paneEmpty(h, {
    icon: "mark-agents",
    title: "No agents yet",
    copy: mayCreate(model)
      ? "Add an agent: a member that works on a harness and a model your connections give."
      : "An administrator can add agents to your workspace.",
    ...(mayAdd(model) && Option.isNone(model.adding)
      ? { action: button(h, "Add agent", Message.ClickedAdd(), { variant: "primary" }) }
      : {})
  })

/** The tabs over the list, All and Needs setup, each with how many agents are on it once they are read. */
const browseTabs = (model: Model, h: AgentsViewBuilder): Html => {
  const listed = listedAgents(model)
  const tab = (tab: BrowseTab, label: string, count: number) => ({
    label,
    ...(model.isLoaded ? { count } : {}),
    isCurrent: model.browse.tab === tab,
    onClick: Message.ChoseBrowseTab({ tab })
  })

  return paneTabs(h, {
    label: "Agents",
    tabs: [tab("All", "All", listed.length), tab("NeedsSetup", "Needs setup", listed.filter(needsSetup).length)]
  })
}

/** The list, or what it says when the workspace has no agent; nothing before the agents are read. */
const listBody = (model: Model, h: AgentsViewBuilder): Html => {
  if (!model.isLoaded) {
    return h.empty
  }

  return listedAgents(model).length === 0 ? noAgents(model, h) : agentList(model, h)
}

/** The form that adds an agent, under the list: its name, its role, how it is set up, and why the last try failed. */
const addingForm = (adding: Adding, model: Model, h: AgentsViewBuilder): Html =>
  paneForm(h, { title: "Add an agent", onSubmit: Message.SubmittedAdding() }, [
    field(
      h,
      {
        id: "add-agent-name",
        label: "Name",
        type: "text",
        value: adding.name,
        onInput: (name) => Message.TypedAddingName({ name })
      },
      Option.none()
    ),
    choiceSelect(h, {
      id: "add-agent-role",
      label: "Role",
      choices: givableRoles(model).map(({ id, name }) => [id, name] as const),
      value: adding.roleId,
      onChange: (roleId) => Message.ChoseRole({ roleId })
    }),
    ...setupFields(h, model, {
      idPrefix: "add-agent",
      target: SetupTarget.Adding(),
      setup: adding.setup,
      problems: problemsOf(adding.failure),
      isDisabled: false
    }),
    notice(h, Option.map(adding.failure, failureMessage)),
    buttonRow(h, [submit(h, "Add"), button(h, "Cancel", Message.ClickedCancelAdding(), { variant: "quiet" })])
  ])

/**
 * The agents as the list page, the main content: All and those that need setup on a tab each, with the button to add
 * one for a person who may, a search that narrows the tab by name, and a row for each agent, which picking opens as
 * its own page. The form that adds an agent is under the list.
 */
export const view = AgentsComposition.makeView((model, h) =>
  pane(h, {
    variant: "main",
    label: "Agents",
    header: {
      title: "Agents",
      icon: "mark-agents",
      actions: mayAdd(model) && Option.isNone(model.adding) ? [button(h, "Add agent", Message.ClickedAdd())] : [],
      tabs: browseTabs(model, h)
    },
    body: [
      paneColumn(
        h,
        [
          notice(h, model.notice),
          mayCreate(model) && Option.isNone(model.adding) ? integrationsView(model, h) : h.empty,
          listBody(model, h),
          Option.match(model.adding, { onNone: () => h.empty, onSome: (adding) => addingForm(adding, model, h) })
        ],
        { isWide: true }
      )
    ]
  })
)

/** The agent whose page it is, and the name of the workspace, which a phone shows under the title. */
export type AgentInputs = Readonly<{ agentId: Identity.AgentId; workspaceName: string }>

/** The message of the failure the edit holds about `action`, when it holds one. */
const failureAbout = (edit: Option.Option<Edit>, action: AgentAction): Option.Option<string> =>
  Option.map(
    Option.filter(
      Option.flatMap(edit, (open) => open.failure),
      (failure) => failure.action === action
    ),
    failureMessage
  )

/** The form that renames the agent, where the person may; for another, the name alone. */
const nameForm = (
  item: AgentItem,
  model: Model,
  edit: Option.Option<Edit>,
  isEditable: boolean,
  h: AgentsViewBuilder
): Html => {
  const agentId = item.agent.id
  const isSaving = Option.exists(edit, (open) => Option.exists(open.saving, (action) => action === "Rename"))

  return form(h, { onSubmit: Message.SubmittedName({ agentId }), label: "Name", variant: "pane" }, [
    field(
      h,
      {
        id: "agent-name",
        label: "Agent name",
        type: "text",
        value: nameDraftOf(model, item),
        isAutofocus: false,
        isDisabled: !isEditable || isSaving,
        onInput: (name) => Message.TypedName({ agentId, name })
      },
      Option.none()
    ),
    notice(h, failureAbout(edit, "Rename")),
    ...(isEditable
      ? [
          buttonRow(h, [
            submit(h, "Save name", { variant: "secondary", isDisabled: !isNameChanged(model, item) || isSaving })
          ])
        ]
      : [])
  ])
}

/** The form that sets the agent up again as a whole, where the person may; for another, the setup alone. */
const setupForm = (
  item: AgentItem,
  model: Model,
  edit: Option.Option<Edit>,
  isEditable: boolean,
  h: AgentsViewBuilder
): Html => {
  const agentId = item.agent.id
  const isSaving = Option.exists(edit, (open) => Option.exists(open.saving, (action) => action === "Configure"))
  const isChanged = isSetupChanged(model, item)
  const failure = Option.filter(
    Option.flatMap(edit, (open) => open.failure),
    (about) => about.action === "Configure"
  )

  return paneForm(h, { title: "Setup", onSubmit: Message.SubmittedSetup({ agentId }), hasStitch: true }, [
    ...setupFields(h, model, {
      idPrefix: "agent-setup",
      target: SetupTarget.Agent({ agentId }),
      setup: setupDraftOf(model, item),
      problems: problemsOf(failure),
      isDisabled: !isEditable || isSaving
    }),
    notice(h, Option.map(failure, failureMessage)),
    ...(isEditable
      ? [
          buttonRow(h, [
            submit(h, "Save setup", { isDisabled: !isChanged || isSaving }),
            ...(isChanged
              ? [button(h, "Discard changes", Message.ClickedDiscardSetup({ agentId }), { isDisabled: isSaving })]
              : [])
          ])
        ]
      : [])
  ])
}

/** What the agent's page says about it that is not set up by the person: its role, what it is at work on, and who made it. */
const detailsSection = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html =>
  paneSection(h, {
    title: "Details",
    hasStitch: true,
    children: [
      detailList(h, [
        { label: "Role", value: "Changed in Settings › Members, as any member's is." },
        { label: "Current activity", value: "Idle" },
        {
          label: "Created by",
          value: `${memberName(model.members, item.agent.createdBy)} · ${calendarDate(item.agent.createdAt)}`
        }
      ])
    ]
  })

/** Why the agent can't run as it is set up, as a note over the page, one line for each reason; nothing when it can. */
const readinessNote = ({ agent, pending }: AgentItem, h: AgentsViewBuilder): Html =>
  pending
    ? h.empty
    : Agent.Readiness.match(agent.readiness, {
        Ready: () => h.empty,
        Incomplete: ({ issues }) =>
          noticeBox(h, { title: "This agent can't run as it is set up", lines: issues.map(issueSentence) })
      })

/** The page of an agent: why it can't run, its name, its setup, its details, in one column. */
const agentPage = (item: AgentItem, model: Model, workspaceName: string, h: AgentsViewBuilder): Html => {
  const name = nameOfAgent(model, item.agent)
  const edit = findEdit(model, item.agent.id)
  const isEditable = mayConfigure(model, item.agent) && !item.pending

  return pane(h, {
    variant: "main",
    label: name,
    header: {
      title: name,
      mark: { text: name.slice(0, 1), tone: "lilac" },
      status: statusOf(item),
      phoneContext: workspaceName,
      ...(item.pending ? { context: "Sending…" } : {})
    },
    body: [
      paneColumn(h, [
        readinessNote(item, h),
        nameForm(item, model, edit, isEditable, h),
        setupForm(item, model, edit, isEditable, h),
        detailsSection(item, model, h)
      ])
    ]
  })
}

/** What the page of an agent says when the workspace does not list it: it was removed, or the person can no longer see it. */
const missingAgent = (workspaceName: string, h: AgentsViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Agent",
    header: { title: "Agent", phoneContext: workspaceName },
    body: [
      paneEmpty(h, {
        icon: "mark-agents",
        title: "This agent isn't here",
        copy: "It may have been removed, or you can no longer see it.",
        action: button(h, "Show all agents", Message.ClickedBrowse())
      })
    ]
  })

/**
 * The page of one agent, the main content: why it can't run, its name, its setup, and its details. A person who
 * may configure it renames it and sets it up again, each saved apart; another reads the same values. An agent the
 * workspace does not list says so, and offers the list; nothing shows before the agents are read.
 */
export const agentView = AgentsComposition.makeView.withInputs<AgentInputs>((model, { agentId, workspaceName }, h) =>
  Option.match(findListedAgent(model, agentId), {
    onNone: () =>
      model.isLoaded
        ? missingAgent(workspaceName, h)
        : pane(h, {
            variant: "main",
            label: "Agent",
            header: { title: "Agent", phoneContext: workspaceName },
            body: []
          }),
    onSome: (item) => agentPage(item, model, workspaceName, h)
  })
)

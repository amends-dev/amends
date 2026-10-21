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
  loadingLine,
  notice,
  noticeBox,
  searchField,
  submit
} from "@amends-dev/design/control"
import { activityList, detailList } from "@amends-dev/design/details"
import { activityCell, cellWithDetail, columns, loadingRows, row } from "@amends-dev/design/directory"
import { form } from "@amends-dev/design/form"
import { modal } from "@amends-dev/design/modal"
import { pane, paneColumn, paneEmpty, paneForm, paneSection, paneTabs, paneToolbar } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import type { Viewport } from "@amends-dev/design/viewport"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import {
  activityLabel,
  type AgentActivity,
  motionOfState,
  placesLine,
  stateWord,
  turnLabel,
  type TurnUnderWay
} from "../../agentActivity.ts"
import { issueSentence, sidebarActivity, statusOfAgent } from "../../agentStanding.ts"
import { calendarDate, memberName } from "../../seen.ts"
import { Integrations } from "../connections/definition.ts"
import { AgentsComposition, type AgentsViewBuilder, DialogBinding } from "./composition.ts"
import {
  activityOfAgent,
  type Adding,
  type AgentAction,
  type AgentItem,
  type BrowseTab,
  connectionName,
  type Edit,
  failureMessage,
  findEdit,
  findListedAgent,
  isAddingReady,
  isNameChanged,
  isSetupChanged,
  listedAgents,
  mayAdd,
  mayConfigure,
  mayCreate,
  mayRemove,
  Message,
  type Model,
  nameDraftOf,
  nameOfAgent,
  needsSetup,
  problemsOf,
  type Removing,
  SetupTarget,
  setupDraftOf,
  shownAgents,
  startingRoles,
  turnsOfAgent
} from "./definition.ts"
import { setupFields } from "./setupFields.ts"

/** The harness an agent runs on, as a line: `Auto`, or the connection's name. */
const harnessLine = (agent: AgentItem["agent"], model: Model): string =>
  Agent.Harness.match(agent.harness, {
    Auto: () => "Auto",
    Connection: ({ connectionId }) => connectionName(model, connectionId)
  })

/** Where an agent works, as a line: the sandbox connection's name, or "No sandbox". */
const sandboxLine = (agent: AgentItem["agent"], model: Model): string =>
  agent.sandbox === null ? "No sandbox" : connectionName(model, agent.sandbox.connectionId)

/**
 * What the host's integrations say while the person waits for them, or why they could not be listed, with a way to ask
 * again.
 */
const integrationsView = (model: Model, h: AgentsViewBuilder): Html =>
  Integrations.match(model.integrations, {
    Loading: () => hint(h, "Loading the integrations…"),
    Failed: ({ error }) =>
      column(h, [
        notice(h, Option.some(error)),
        buttonRow(h, [button(h, "Try again", Message.ClickedReloadIntegrations(), { variant: "quiet" })])
      ]),
    Loaded: () => h.empty
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
            : listed.map((item) => {
                const activity = activityOfAgent(model, item)

                return sidebarItem(h, {
                  mark: { text: nameOfAgent(model, item.agent).slice(0, 1), tone: "lilac" },
                  status: statusOfAgent(item, activity),
                  ...sidebarActivity(activity),
                  label: nameOfAgent(model, item.agent),
                  isPending: item.pending,
                  isCurrent: Option.contains(openAgentId, item.agent.id),
                  onClick: Message.ClickedAgent({ agentId: item.agent.id })
                })
              })
      })
    ])
  }
)

/**
 * The list's Activity cell for an agent: the logo moving as its most pressing turn does, the state, and over it the
 * places it is at work; blank while the agent is idle.
 */
const activityCellOf = (activity: Option.Option<AgentActivity>, h: AgentsViewBuilder): Html =>
  Option.match(activity, {
    onNone: () => h.empty,
    onSome: ({ state, places }) =>
      activityCell(h, {
        state: stateWord[state],
        motion: motionOfState[state],
        ...(places.length === 0 ? {} : { place: placesLine(places) })
      })
  })

/**
 * An agent as a row of the list: its lilac mark with how it stands as a patch on it, its name, its harness over its
 * sandbox, its model over its connection, and, blank while it is idle, where it is at work and in what state.
 */
const agentRow = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html => {
  const { agent, pending } = item
  const name = nameOfAgent(model, agent)
  const harness = harnessLine(agent, model)
  const sandbox = sandboxLine(agent, model)
  const connection = connectionName(model, agent.model.connectionId)
  const activity = activityOfAgent(model, item)

  return h.keyed("li")(
    agent.id,
    [],
    [
      row(h, {
        mark: { text: name.slice(0, 1), tone: "lilac" },
        markSize: "md",
        status: statusOfAgent(item, activity),
        title: name,
        ...(pending ? { meta: "Sending…" } : {}),
        cells: [
          cellWithDetail(h, { value: harness, detail: sandbox }),
          cellWithDetail(h, { value: agent.model.id, detail: connection }),
          activityCellOf(activity, h)
        ],
        cellsText: [
          harness,
          sandbox,
          agent.model.id,
          connection,
          ...Option.toArray(Option.map(activity, activityLabel))
        ].join(" · "),
        onClick: Message.ClickedAgent({ agentId: agent.id })
      })
    ]
  )
}

/**
 * What the list says when it has no row to show: nothing is there to browse, nothing needs setup, or nothing matches.
 */
const emptyList = (model: Model, h: AgentsViewBuilder): Html => {
  const { tab, query } = model.browse

  if (query.trim() !== "") {
    return paneEmpty(h, {
      art: "nothing-here",
      title: `No agents match “${query.trim()}”.`,
      action: button(h, "Clear search", Message.TypedBrowseQuery({ query: "" }), { variant: "quiet" })
    })
  }

  return tab === "NeedsSetup"
    ? paneEmpty(h, { art: "rest", title: "Every agent can run as it is set up." })
    : paneEmpty(h, { art: "sew-in", title: "No agents yet" })
}

/** The search over the agents, and, over the rows, the labels of the columns once an agent is shown. */
const agentToolbar = (model: Model, h: AgentsViewBuilder): ReadonlyArray<Html> => [
  paneToolbar(h, {
    start: [
      searchField(h, {
        id: "search-agents",
        label: "Search agents",
        placeholder: "Search agents…",
        value: model.browse.query,
        onInput: (query) => Message.TypedBrowseQuery({ query })
      })
    ]
  }),
  ...(shownAgents(model).length === 0 ? [] : [columns(h, { label: "Agent", cells: ["Harness", "Model", "Activity"] })])
]

/** A row for each agent shown, or what the list says when it has none to show. */
const agentRows = (model: Model, h: AgentsViewBuilder): Html => {
  const shown = shownAgents(model)

  return shown.length === 0
    ? emptyList(model, h)
    : h.ul(
        [h.AriaLabel("Agents")],
        shown.map((item) => agentRow(item, model, h))
      )
}

/** What the list says when the workspace has no agent at all, and what a person who may add one can do about it. */
const noAgents = (model: Model, h: AgentsViewBuilder): Html =>
  paneEmpty(h, {
    art: "sew-in",
    title: "No agents yet",
    copy: mayCreate(model)
      ? "Add an agent: a member that works on a harness and a model your connections give."
      : "An administrator can add agents to your workspace.",
    ...(mayAdd(model) ? { action: button(h, "Add agent", Message.ClickedAdd(), { variant: "primary" }) } : {})
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

/** Whether the agents could not be read, which is why there are none to show: nothing was read, and why. */
const isUnread = (model: Model): boolean => !model.isLoaded && Option.isSome(model.notice)

/** What a page says in place of the agents when they could not be read: why, as the line under the title. */
const unreadAgents = (model: Model, h: AgentsViewBuilder): Html =>
  paneEmpty(h, {
    art: "came-apart",
    title: "Couldn’t load agents",
    ...Option.match(model.notice, { onNone: () => ({}), onSome: (copy) => ({ copy }) }),
    action: button(h, "Retry", Message.ClickedRetry())
  })

/**
 * The list, or what it says when the workspace has no agent; rows that stand in for it while the agents are read,
 * and why they could not be when they could not.
 */
const listBody = (model: Model, h: AgentsViewBuilder): Html => {
  if (isUnread(model)) {
    return unreadAgents(model, h)
  }

  if (!model.isLoaded) {
    return loadingRows(h, { label: "Loading agents…", markSize: "md" })
  }

  return listedAgents(model).length === 0 ? noAgents(model, h) : agentRows(model, h)
}

/** Whether the list has agents to search and label, which is when it has a toolbar. */
const hasAgentList = (model: Model): boolean => model.isLoaded && listedAgents(model).length > 0

/**
 * The name of the workspace, which a phone shows under the title, and the width of the window, which a phone has the
 * button to add an agent say Add for.
 */
export type ListInputs = Readonly<{ workspaceName: string; viewport: Viewport }>

/** The button to add an agent, for a person who may, which is called Add where there is no room for more. */
const addActions = (model: Model, viewport: Viewport, h: AgentsViewBuilder): ReadonlyArray<Html> =>
  mayAdd(model) ? [button(h, viewport === "Phone" ? "Add" : "Add agent", Message.ClickedAdd())] : []

/**
 * The agents as the list page, the main content: All and those that need setup on a tab each, with the button to add
 * one for a person who may, which opens the dialog `dialogView` renders, a toolbar with a search that narrows the tab
 * by name, and a row for each agent, which picking opens as its own page.
 */
export const view = AgentsComposition.makeView.withInputs<ListInputs>((model, { workspaceName, viewport }, h) =>
  pane(h, {
    variant: "main",
    label: "Agents",
    header: {
      title: "Agents",
      icon: "mark-agents",
      phoneContext: workspaceName,
      actions: addActions(model, viewport, h),
      tabs: browseTabs(model, h)
    },
    ...(hasAgentList(model) ? { toolbar: agentToolbar(model, h) } : {}),
    body: [
      paneColumn(
        h,
        [
          isUnread(model) ? h.empty : notice(h, model.notice),
          mayCreate(model) ? integrationsView(model, h) : h.empty,
          listBody(model, h)
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

/**
 * A turn under way as a line of the agent's page: the logo as the turn goes, its state, and the place it is in, as one
 * button that opens the turn's thread, named as `apps/ui` names its link to the turn's log: "Working in #general: open
 * its log".
 */
const turnLine = (turn: TurnUnderWay) => ({
  key: turn.turnId,
  state: stateWord[turn.state],
  motion: motionOfState[turn.state],
  place: Option.getOrUndefined(turn.place),
  action: {
    name: `${turnLabel(turn)}: open its log`,
    onClick: Message.ClickedTurn({ groupId: turn.groupId, threadId: turn.threadId })
  }
})

/** What the agent is doing now, a line for each turn under way, the most pressing first, or Idle when it has none. */
const currentActivity = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html | string => {
  const turns = turnsOfAgent(model, item)

  return turns.length === 0 ? "Idle" : activityList(h, { label: "Turns under way", lines: turns.map(turnLine) })
}

/**
 * What the agent's page says about it that is not set up by the person: its role, what it is at work on, and who made
 * it.
 */
const detailsSection = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html =>
  paneSection(h, {
    title: "Details",
    hasStitch: true,
    children: [
      detailList(h, [
        { label: "Role", value: "Changed in Settings › Members, as any member’s is." },
        { label: "Current activity", value: currentActivity(item, model, h) },
        {
          label: "Created by",
          value: `${memberName(model.members, item.agent.createdBy)} · ${calendarDate(item.agent.createdAt)}`
        }
      ])
    ]
  })

/** What removing the agent does, and the button that asks to confirm it, for a person who may remove it. */
const removalSection = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html =>
  mayRemove(model, item.agent) && !item.pending
    ? paneSection(h, {
        title: "Removal",
        hasStitch: true,
        children: [
          hint(h, "Removing this agent ends its membership. Its messages stay in their threads."),
          buttonRow(h, [button(h, "Remove agent", Message.ClickedRemove({ agentId: item.agent.id }))])
        ]
      })
    : h.empty

/** Why the agent can't run as it is set up, as a note over the page, one line for each reason; nothing when it can. */
const readinessNote = ({ agent, pending }: AgentItem, h: AgentsViewBuilder): Html =>
  pending
    ? h.empty
    : Agent.Readiness.match(agent.readiness, {
        Ready: () => h.empty,
        Incomplete: ({ issues }) =>
          noticeBox(h, { title: "This agent can’t run as it is set up", lines: issues.map(issueSentence) })
      })

/** The page of an agent: why it can't run, its name, its setup, its details, and its removal, in one column. */
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
      status: statusOfAgent(item, activityOfAgent(model, item)),
      phoneContext: workspaceName,
      ...(item.pending ? { context: "Sending…" } : {})
    },
    body: [
      paneColumn(h, [
        readinessNote(item, h),
        nameForm(item, model, edit, isEditable, h),
        setupForm(item, model, edit, isEditable, h),
        detailsSection(item, model, h),
        removalSection(item, model, h)
      ])
    ]
  })
}

/**
 * What the page of an agent says when the workspace does not list it: it was removed, or the person can no longer see
 * it.
 */
const missingAgent = (workspaceName: string, h: AgentsViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Agent",
    header: { title: "Agent", phoneContext: workspaceName },
    body: [
      paneEmpty(h, {
        art: "lost-thread",
        title: "This agent isn’t here",
        copy: "It may have been removed, or you can no longer see it.",
        action: button(h, "Show all agents", Message.ClickedBrowse())
      })
    ]
  })

/** What the page of an agent says before the agents are read, and why they could not be when they could not. */
const readingAgent = (model: Model, workspaceName: string, h: AgentsViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Agent",
    header: { title: "Agent", phoneContext: workspaceName },
    body: [isUnread(model) ? unreadAgents(model, h) : loadingLine(h, "Loading agent…")]
  })

/**
 * The page of one agent, the main content: why it can't run, its name, its setup, its details, and, for a person who
 * may remove it, its removal, which asks to confirm in the dialog `dialogView` renders. A person who may configure
 * it renames it and sets it up again, each saved apart; another reads the same values. An agent the workspace does
 * not list says so, and offers the list; a line says the agents are being read until they are.
 */
export const agentView = AgentsComposition.makeView.withInputs<AgentInputs>((model, { agentId, workspaceName }, h) =>
  Option.match(findListedAgent(model, agentId), {
    onNone: () => (model.isLoaded ? missingAgent(workspaceName, h) : readingAgent(model, workspaceName, h)),
    onSome: (item) => agentPage(item, model, workspaceName, h)
  })
)

/** The name of the workspace, which the dialog that adds an agent says it adds the agent to. */
export type DialogInputs = Readonly<{ workspaceName: string }>

/**
 * The dialog that adds an agent: its name, the role it starts with, which a person who may not give shows as
 * unavailable, and how it is set up, with Create agent disabled until a name, a role, and a model are chosen. What
 * could not be made shows under the fields.
 */
const addingModal = (
  render: RenderInfo,
  adding: Adding,
  model: Model,
  workspaceName: string,
  h: AgentsViewBuilder
): Html => {
  const isSending = Option.isSome(adding.creating)

  return modal(h, render, {
    title: "Add agent",
    context: workspaceName,
    size: "form",
    body: [
      field(
        h,
        {
          id: "add-agent-name",
          label: "Agent name",
          type: "text",
          value: adding.name,
          hint: "How the workspace calls and mentions it.",
          isAutofocus: false,
          isDisabled: isSending,
          attributes: render.initialFocus,
          onInput: (name) => Message.TypedAddingName({ name })
        },
        Option.none()
      ),
      choiceSelect(h, {
        id: "add-agent-role",
        label: "Role",
        choices: startingRoles(model).map(({ role, isGivable }) =>
          isGivable
            ? ([role.id, role.name] as const)
            : ([role.id, role.name, { description: "Only the owner can give this role", isDisabled: true }] as const)
        ),
        value: adding.roleId,
        hint: "What it may do in the workspace, as a member with this role.",
        isDisabled: isSending,
        onChange: (roleId) => Message.ChoseRole({ roleId })
      }),
      ...setupFields(h, model, {
        idPrefix: "add-agent",
        target: SetupTarget.Adding(),
        setup: adding.setup,
        problems: problemsOf(adding.failure),
        isDisabled: isSending
      }),
      notice(h, Option.map(adding.failure, failureMessage))
    ],
    cancelLabel: "Cancel",
    isCancelLeading: true,
    footer: [submit(h, isSending ? "Creating…" : "Create agent", { isDisabled: !isAddingReady(adding) || isSending })],
    onSubmit: Message.SubmittedAdding()
  })
}

/**
 * The dialog that confirms removing an agent, named in its context, saying it leaves the workspace and its messages
 * stay, with why the last try failed.
 */
const removingModal = (render: RenderInfo, removing: Removing, h: AgentsViewBuilder): Html =>
  modal(h, render, {
    title: "Remove agent?",
    size: "compact",
    context: removing.name,
    description: `${removing.name} will leave the workspace. Its messages stay in their threads.`,
    body: [notice(h, Option.map(removing.failure, failureMessage))],
    cancelLabel: "Cancel",
    isCancelLeading: true,
    footer: [submit(h, removing.isSending ? "Removing…" : "Remove agent", { isDisabled: removing.isSending })],
    onSubmit: Message.ConfirmedRemoval()
  })

/**
 * What the dialog shows: the form that adds an agent, or the confirmation that removes one; an empty frame while it has
 * neither.
 */
const dialogModal = (render: RenderInfo, model: Model, workspaceName: string, h: AgentsViewBuilder): Html =>
  Option.match(model.adding, {
    onSome: (adding) => addingModal(render, adding, model, workspaceName, h),
    onNone: () =>
      Option.match(model.removing, {
        onSome: (removing) => removingModal(render, removing, h),
        onNone: () => modal(h, render, { title: "", body: [] })
      })
  })

/**
 * The dialog for adding an agent or confirming its removal, which the page lends the shell: it renders its `dialog`
 * element, with nothing in it while it is closed, wherever the page puts the buttons that open it, the sidebar's, the
 * list's, and the agent's, whether or not the sidebar is on the page.
 */
export const dialogView = AgentsComposition.makeView.withInputs<DialogInputs>((model, { workspaceName }, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "dialog",
      model: model.dialog,
      viewInputs: {
        hasDescription: Option.isNone(model.adding) && Option.isSome(model.removing),
        toView: (render) => dialogModal(render, model, workspaceName, h)
      }
    })
  )
)

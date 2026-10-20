import { Agent } from "@amends-dev/core/agent"
import {
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  hint,
  iconButton,
  notice,
  submit,
  textarea
} from "@amends-dev/design/control"
import { cellWithDetail, columns, row } from "@amends-dev/design/directory"
import type { MarkStatus } from "@amends-dev/design/mark"
import { pane, paneColumn, paneEmpty, paneForm, paneTabs } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type * as AgentSetup from "../../agentSetup.ts"
import { connectionsGiving, Integrations } from "../connections/definition.ts"
import { givableRoles } from "../settings/definition.ts"
import { AgentsComposition, type AgentsViewBuilder } from "./composition.ts"
import {
  type AgentItem,
  type BrowseTab,
  connectionName,
  findAgentName,
  Form,
  listedAgents,
  mayAdd,
  mayCreate,
  Message,
  type Model,
  nameOfAgent,
  needsSetup,
  OfferedModels,
  shownAgents
} from "./definition.ts"

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

/** The model of the setup, from what its connection offers: those it lists, its id for others, and its effort. */
const modelFields = (setup: AgentSetup.Draft, model: Model, h: AgentsViewBuilder): ReadonlyArray<Html> =>
  Option.match(
    Option.filter(model.offered, ({ connectionId }) => connectionId === setup.modelConnectionId),
    {
      onNone: () => [],
      onSome: (offered) =>
        OfferedModels.match(offered, {
          Loading: () => [hint(h, "Loading the models…")],
          Failed: ({ error }) => [notice(h, Option.some(error))],
          Loaded: ({ models }) => {
            const chosen = models.listed.find(({ id }) => id === setup.modelId)
            const efforts = chosen?.reasoning?.efforts ?? []
            return [
              models.listed.length === 0
                ? h.empty
                : choiceSelect(h, {
                    id: "agent-model",
                    label: "Model",
                    choices: [
                      ["", "Choose a model"] as const,
                      ...models.listed.map(({ id, name }) => [id, name] as const)
                    ],
                    value: chosen === undefined ? "" : chosen.id,
                    onChange: (modelId) => Message.ChoseModel({ modelId })
                  }),
              models.unlisted
                ? field(
                    h,
                    {
                      id: "agent-model-id",
                      label: "Model ID",
                      type: "text",
                      value: setup.modelId,
                      onInput: (modelId) => Message.ChoseModel({ modelId })
                    },
                    Option.none()
                  )
                : h.empty,
              efforts.length === 0
                ? h.empty
                : choiceSelect(h, {
                    id: "agent-effort",
                    label: "Effort",
                    choices: [["", "The model's own"] as const, ...efforts.map((effort) => [effort, effort] as const)],
                    value: setup.effort,
                    onChange: (effort) => Message.ChoseEffort({ effort })
                  })
            ]
          }
        })
    }
  )

/** How an agent is set up, as the form fills it in. */
const setupFields = (setup: AgentSetup.Draft, model: Model, h: AgentsViewBuilder): ReadonlyArray<Html> => [
  textarea(h, {
    id: "agent-instructions",
    label: "Instructions",
    value: setup.instructions,
    onInput: (instructions) => Message.TypedInstructions({ instructions })
  }),
  choiceSelect(h, {
    id: "agent-harness",
    label: "Harness",
    choices: [["", "Auto"] as const, ...connectionsGiving(model, "harnesses")],
    value: setup.harness,
    onChange: (harness) => Message.ChoseHarness({ harness })
  }),
  choiceSelect(h, {
    id: "agent-model-connection",
    label: "Model connection",
    choices: [["", "Choose a connection"] as const, ...connectionsGiving(model, "models")],
    value: setup.modelConnectionId,
    onChange: (connectionId) => Message.ChoseModelConnection({ connectionId })
  }),
  ...modelFields(setup, model, h),
  choiceSelect(h, {
    id: "agent-sandbox",
    label: "Sandbox",
    choices: [["", "None"] as const, ...connectionsGiving(model, "sandboxes")],
    value: setup.sandbox,
    onChange: (sandbox) => Message.ChoseSandbox({ sandbox })
  })
]

/** The form open among the agents. */
const formView = (open: Form, model: Model, h: AgentsViewBuilder): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelForm(), { variant: "quiet" })
  const nameField = (name: string) =>
    field(
      h,
      { id: "agent-name", label: "Name", type: "text", value: name, onInput: (name) => Message.TypedName({ name }) },
      Option.none()
    )
  return Form.match(open, {
    Adding: ({ name, roleId, setup, error }) =>
      paneForm(h, { title: "Add an agent", onSubmit: Message.SubmittedForm() }, [
        nameField(name),
        choiceSelect(h, {
          id: "agent-role",
          label: "Role",
          choices: givableRoles(model).map(({ id, name }) => [id, name] as const),
          value: roleId,
          onChange: (roleId) => Message.ChoseRole({ roleId })
        }),
        ...setupFields(setup, model, h),
        notice(h, error),
        buttonRow(h, [submit(h, "Add"), cancel])
      ]),
    Configuring: ({ agentId, setup, error }) =>
      paneForm(h, { title: "Change the agent's setup", onSubmit: Message.SubmittedForm() }, [
        ...setupFields(setup, model, h),
        notice(h, error),
        buttonRow(h, [
          submit(h, "Save"),
          ...(Option.isSome(findAgentName(model, agentId))
            ? [button(h, "Rename", Message.ClickedRename({ agentId }), { variant: "quiet" })]
            : []),
          cancel
        ])
      ]),
    Renaming: ({ name }) =>
      paneForm(h, { title: "Rename the agent", onSubmit: Message.SubmittedForm() }, [
        nameField(name),
        buttonRow(h, [submit(h, "Save"), cancel])
      ])
  })
}

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
      connectionsGiving(model, "models").length === 0
        ? hint(h, "An agent needs a connection that gives models.")
        : h.empty
  })

/** Whether the list page, which the sidebar's title opens, is what the main content shows. */
export type SidebarInputs = Readonly<{ isListOpen: boolean }>

/**
 * The sidebar's section of the agents: each by its name on a lilac mark with how it stands as a patch on it, Browse
 * to the list and, for a person who may add one, Add agent. The title opens the list and is current while it shows,
 * and picking an agent reports it. An empty section says so once the agents are read.
 */
export const sidebarView = AgentsComposition.makeView.withInputs<SidebarInputs>((model, { isListOpen }, h) => {
  const listed = listedAgents(model)

  return sidebarSections(h, [
    sidebarSection(h, {
      label: "Agents",
      onTitleClick: Message.ClickedBrowse(),
      isTitleCurrent: isListOpen,
      actions: [
        iconButton(h, { icon: "list", label: "Browse agents", onClick: Message.ClickedBrowse() }, { size: "compact" }),
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
                isCurrent: false,
                onClick: Message.ClickedAgent({ agentId: item.agent.id })
              })
            )
    })
  ])
})

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
    ...(mayAdd(model) && Option.isNone(model.form)
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

/**
 * The agents as the list page, the main content: All and those that need setup on a tab each, with the button to add
 * one for a person who may, a search that narrows the tab by name, and a row for each agent, which picking opens
 * below the list as its setup form until the agent has a page. The form open among the agents is under the list.
 */
export const view = AgentsComposition.makeView((model, h) =>
  pane(h, {
    variant: "main",
    label: "Agents",
    header: {
      title: "Agents",
      icon: "mark-agents",
      actions: mayAdd(model) && Option.isNone(model.form) ? [button(h, "Add agent", Message.ClickedAdd())] : [],
      tabs: browseTabs(model, h)
    },
    body: [
      paneColumn(
        h,
        [
          notice(h, model.notice),
          mayCreate(model) && Option.isNone(model.form) ? integrationsView(model, h) : h.empty,
          listBody(model, h),
          Option.match(model.form, { onNone: () => h.empty, onSome: (open) => formView(open, model, h) })
        ],
        { isWide: true }
      )
    ]
  })
)

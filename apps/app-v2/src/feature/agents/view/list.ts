/** Browse and search agents, their setup, and their activity. */

import { Agent } from "@amends-dev/core/agent"
import { button, buttonRow, column, hint, notice, searchField } from "@amends-dev/design/control"
import { activityCell, cellWithDetail, columns, loadingRows, row } from "@amends-dev/design/directory"
import { pane, paneColumn, paneEmpty, paneTabs, paneToolbar } from "@amends-dev/design/pane"
import type { Viewport } from "@amends-dev/design/viewport"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { type AgentActivity, activityOfAgent, type AgentItem, readinessOfAgent } from "../../../data/agents.ts"
import { Integrations } from "../../../data/connections.ts"
import { activityLabel, motionOfState, placesLine, stateWord, statusOfAgent } from "../../../view/agents.ts"
import { AgentsBlock } from "../block.ts"
import type { AgentsViewBuilder } from "../composition.ts"
import {
  type BrowseTab,
  connectionName,
  listedAgents,
  mayAdd,
  mayCreate,
  Message,
  type Model,
  nameOfAgent,
  needsSetup,
  shownAgents
} from "../definition.ts"
import { isUnread, unreadAgents } from "./feedback.ts"

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
        status: statusOfAgent(readinessOfAgent(item), activity),
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
export const view = AgentsBlock.makeView.withInputs<ListInputs>((model, { workspaceName, viewport }, h) =>
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

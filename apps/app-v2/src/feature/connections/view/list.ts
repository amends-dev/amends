/** Browse and search the workspace’s connections. */

import { button, buttonRow, column, hint, notice, searchField } from "@amends-dev/design/control"
import { columns, loadingRows, row } from "@amends-dev/design/directory"
import { pane, paneColumn, paneEmpty, paneTabs, paneToolbar } from "@amends-dev/design/pane"
import type { Viewport } from "@amends-dev/design/viewport"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { areIntegrationsListed, type ConnectionItem, Integrations, integrationOf } from "../../../data/connections.ts"
import { ConnectionsBlock } from "../block.ts"
import type { ConnectionsViewBuilder } from "../composition.ts"
import {
  type ConnectionsTab,
  connectionsOnTab,
  mayAdd,
  mayCreate,
  Message,
  type Model,
  shownConnections
} from "../definition.ts"
import { authLabels, connectionStatus, integrationLine, tabLabel } from "../wording.ts"
import { isUnread, unreadConnections } from "./feedback.ts"

/**
 * What the host's integrations say while the person waits for them, or why they could not be listed, with a way to ask
 * again.
 */
const integrationsView = (model: Model, h: ConnectionsViewBuilder): Html =>
  Integrations.match(model.integrations, {
    Loading: () => hint(h, "Loading the integrations…"),
    Loaded: () => h.empty,
    Failed: ({ error }) =>
      column(h, [
        notice(h, Option.some(error)),
        buttonRow(h, [button(h, "Try again", Message.ClickedReloadIntegrations(), { variant: "quiet" })])
      ])
  })

/**
 * A connection as a row of the list: its tile with how it stands as a patch on it, its name over its integration, and
 * how it authenticates.
 */
const connectionRow = (item: ConnectionItem, model: Model, h: ConnectionsViewBuilder): Html => {
  const { connection, pending } = item
  const authentication = authLabels[connection.auth]
  const integration = integrationLine(integrationOf(model, item), item)

  return h.keyed("li")(
    connection.id,
    [],
    [
      row(h, {
        mark: { icon: "mark-connections" },
        markSize: "md",
        status: connectionStatus(item),
        title: connection.name,
        ...(pending
          ? { meta: "Sending…" }
          : Option.match(integration, { onNone: () => ({}), onSome: (meta) => ({ meta }) })),
        cells: [h.span([], [authentication])],
        cellsText: authentication,
        onClick: Message.ClickedConnection({ connectionId: connection.id })
      })
    ]
  )
}

/** What the list says when it has no row to show: nothing is on the tab, or nothing matches the search. */
const emptyList = (model: Model, h: ConnectionsViewBuilder): Html => {
  const { tab, query } = model.browse

  if (query.trim() !== "") {
    return paneEmpty(h, {
      art: "nothing-here",
      title: `No connections match “${query.trim()}”.`,
      action: button(h, "Clear search", Message.TypedBrowseQuery({ query: "" }), { variant: "quiet" })
    })
  }

  return paneEmpty(h, {
    art: "reach",
    title: tab === "all" ? "No connections yet." : `No ${tabLabel(tab).toLowerCase()} connections yet.`
  })
}

/** The search over the connections, and, over the rows, the labels of the columns once a connection is shown. */
const connectionToolbar = (model: Model, h: ConnectionsViewBuilder): ReadonlyArray<Html> => [
  paneToolbar(h, {
    start: [
      searchField(h, {
        id: "search-connections",
        label: "Search connections",
        placeholder: "Search connections…",
        value: model.browse.query,
        onInput: (query) => Message.TypedBrowseQuery({ query })
      })
    ]
  }),
  ...(shownConnections(model).length === 0 ? [] : [columns(h, { label: "Connection", cells: ["Authentication"] })])
]

/** A row for each connection shown, or what the list says when it has none to show. */
const connectionRows = (model: Model, h: ConnectionsViewBuilder): Html => {
  const shown = shownConnections(model)

  return shown.length === 0
    ? emptyList(model, h)
    : h.ul(
        [h.AriaLabel("Connections")],
        shown.map((item) => connectionRow(item, model, h))
      )
}

/**
 * What the list says when the workspace has no connection at all, and what a person who may add one can do about it.
 */
const noConnections = (model: Model, h: ConnectionsViewBuilder): Html =>
  paneEmpty(h, {
    art: "reach",
    title: "No connections yet",
    copy: mayCreate(model)
      ? "Connect the models, tools, sandboxes, harnesses, and channels your workspace works with."
      : "An administrator can connect models, tools, sandboxes, harnesses, and channels for your workspace.",
    ...(mayAdd(model)
      ? {
          action: button(h, "Add connection", Message.ClickedAdd({ capability: Option.none() }), { variant: "primary" })
        }
      : {})
  })

/**
 * The tabs over the list, All and then what a connection can give, each with how many connections are on it once they
 * are known.
 */
const browseTabs = (model: Model, h: ConnectionsViewBuilder): Html => {
  const tabs: ReadonlyArray<ConnectionsTab> = ["all", "models", "tools", "sandboxes", "harnesses", "channels"]
  const isCounted = (tab: ConnectionsTab) => model.isLoaded && (tab === "all" || areIntegrationsListed(model))

  return paneTabs(h, {
    label: "Connections",
    tabs: tabs.map((tab) => ({
      label: tabLabel(tab),
      ...(isCounted(tab) ? { count: connectionsOnTab(model, tab).length } : {}),
      isCurrent: model.browse.tab === tab,
      onClick: Message.ChoseBrowseTab({ tab })
    }))
  })
}

/**
 * The list, or what it says when the workspace has no connection; rows that stand in for it while the connections
 * are read, and why they could not be when they could not.
 */
const listBody = (model: Model, h: ConnectionsViewBuilder): Html => {
  if (isUnread(model)) {
    return unreadConnections(model, h)
  }

  if (!model.isLoaded) {
    return loadingRows(h, { label: "Loading connections…", markSize: "md" })
  }

  return model.connections.length === 0 ? noConnections(model, h) : connectionRows(model, h)
}

/** Whether the list has connections to search and label, which is when it has a toolbar. */
const hasConnectionList = (model: Model): boolean => model.isLoaded && model.connections.length > 0

/**
 * The name of the workspace, which a phone shows under the title, and the width of the window, which a phone has the
 * button to add a connection say Add for.
 */
export type ListInputs = Readonly<{ workspaceName: string; viewport: Viewport }>

/** The button to add a connection, for a person who may, which is called Add where there is no room for more. */
const addActions = (model: Model, viewport: Viewport, h: ConnectionsViewBuilder): ReadonlyArray<Html> =>
  mayAdd(model)
    ? [button(h, viewport === "Phone" ? "Add" : "Add connection", Message.ClickedAdd({ capability: Option.none() }))]
    : []

/**
 * The connections as the list page, the main content: All and each thing a connection gives on a tab, with how many
 * connections each holds, a toolbar with a search that narrows the tab by the name of a connection or of its
 * integration, and a row for each connection, which picking opens as its own page.
 */
export const view = ConnectionsBlock.makeView.withInputs<ListInputs>((model, { workspaceName, viewport }, h) =>
  pane(h, {
    variant: "main",
    label: "Connections",
    header: {
      title: "Connections",
      icon: "mark-connections",
      phoneContext: workspaceName,
      actions: addActions(model, viewport, h),
      tabs: browseTabs(model, h)
    },
    ...(hasConnectionList(model) ? { toolbar: connectionToolbar(model, h) } : {}),
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

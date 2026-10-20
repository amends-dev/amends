import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import {
  button,
  buttonRow,
  column,
  field,
  hint,
  iconButton,
  link,
  notice,
  noticeBox,
  submit
} from "@amends-dev/design/control"
import { detailList } from "@amends-dev/design/details"
import { columns, row } from "@amends-dev/design/directory"
import { form, settingRow } from "@amends-dev/design/form"
import { pane, paneColumn, paneEmpty, paneForm, paneSection, paneTabs } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { calendarDate, memberName } from "../../seen.ts"
import * as SettingsForm from "../../settingsForm.ts"
import { ConnectionsComposition, type ConnectionsViewBuilder } from "./composition.ts"
import {
  Check,
  checkOf,
  type ConnectionItem,
  type ConnectionsAction,
  type ConnectionsTab,
  connectionItemsGiving,
  connectionsOnTab,
  type Edit,
  type Failure,
  findConnection,
  findEdit,
  Integrations,
  integrationOf,
  isNameChanged,
  isSettingsChanged,
  isUninstalled,
  mayCreate,
  mayManage,
  Message,
  type Model,
  nameDraftOf,
  settingsDraftOf,
  shownConnections
} from "./definition.ts"
import { settingsFields } from "./settingsFields.ts"
import {
  authLabels,
  capabilityLabels,
  connectionsMessage,
  connectionStatus,
  healthWording,
  integrationLine,
  needsRefresh,
  providesLabel,
  tabLabel
} from "./wording.ts"

/** Whether the host has listed its integrations, which say what each connection gives. */
const areIntegrationsListed = (model: Pick<Model, "integrations">): boolean =>
  Integrations.isAnyOf(["Loaded"])(model.integrations)

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
 * What went wrong with a change or a check, for the place it was made, with a way to refresh when what the person sees
 * is out of date.
 */
const failureView = (failure: Option.Option<Failure>, h: ConnectionsViewBuilder): Html =>
  Option.match(failure, {
    onNone: () => h.empty,
    onSome: (failed) =>
      needsRefresh(failed.reason)
        ? column(h, [
            notice(h, Option.some(connectionsMessage(failed))),
            buttonRow(h, [button(h, "Refresh", Message.ClickedRefresh(), { variant: "quiet" })])
          ])
        : notice(h, Option.some(connectionsMessage(failed)))
  })

/** The sections of the sidebar that list connections, one for each thing a connection can give the workspace. */
const capabilitySections = ["models", "tools", "sandboxes", "harnesses"] as const

/**
 * Whether the list is what the main content shows, which marks the title of the tab it is on current; the connection
 * whose page it shows instead, if one; and whether the channels are, which marks the Channels title current.
 */
export type SidebarInputs = Readonly<{
  isListOpen: boolean
  openConnectionId: Option.Option<ConnectionContract.ConnectionId>
  isChannelsOpen: boolean
}>

/**
 * Whether the sidebar may say a section has no connections: they and the integrations that say what they give are read.
 */
const isReadForSections = (model: Model): boolean => model.isLoaded && areIntegrationsListed(model)

/**
 * The sidebar of the connections: a section for each thing a connection gives, Models, Tools, Sandboxes, and
 * Harnesses, listing the connections whose integration gives it, so one that gives two is in both, each with its
 * status at the end of its row, and then Channels, with a way to browse them. A title and a Browse button open the
 * list on that tab, and a row opens the page of its connection. An empty section says so once the connections and
 * the integrations are read.
 */
export const sidebarView = ConnectionsComposition.makeView.withInputs<SidebarInputs>(
  (model, { isListOpen, openConnectionId, isChannelsOpen }, h) =>
    sidebarSections(h, [
      ...capabilitySections.map((capability) => {
        const listed = connectionItemsGiving(model, capability)
        const title = capabilityLabels[capability]
        const openList = Message.ClickedBrowse({ tab: capability })

        return sidebarSection(h, {
          label: title,
          onTitleClick: openList,
          isTitleCurrent: isListOpen && model.browse.tab === capability,
          actions: [
            iconButton(
              h,
              { icon: "list", label: `Browse ${title.toLowerCase()}`, onClick: openList },
              { size: "compact" }
            )
          ],
          children:
            listed.length === 0 && isReadForSections(model)
              ? [sidebarEmpty(h, "None yet")]
              : listed.map((item) =>
                  sidebarItem(h, {
                    icon: "mark-connections",
                    status: connectionStatus(item),
                    label: item.connection.name,
                    isPending: item.pending,
                    isCurrent: Option.contains(openConnectionId, item.connection.id),
                    onClick: Message.ClickedConnection({ connectionId: item.connection.id })
                  })
                )
        })
      }),
      sidebarSection(h, {
        label: "Channels",
        onTitleClick: Message.ClickedBrowseChannels(),
        isTitleCurrent: isChannelsOpen,
        actions: [
          iconButton(
            h,
            { icon: "list", label: "Browse channels", onClick: Message.ClickedBrowseChannels() },
            { size: "compact" }
          )
        ],
        children: []
      })
    ])
)

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
      icon: "mark-search",
      title: `No connections match “${query.trim()}”.`,
      action: button(h, "Clear search", Message.TypedBrowseQuery({ query: "" }), { variant: "quiet" })
    })
  }

  return paneEmpty(h, {
    icon: "mark-connections",
    title: tab === "all" ? "No connections yet." : `No ${tabLabel(tab).toLowerCase()} connections yet.`
  })
}

/** The search over the connections, the labels of the columns, and a row for each connection shown. */
const connectionList = (model: Model, h: ConnectionsViewBuilder): Html => {
  const shown = shownConnections(model)

  return column(h, [
    field(
      h,
      {
        id: "search-connections",
        label: "Search connections",
        type: "search",
        value: model.browse.query,
        onInput: (query) => Message.TypedBrowseQuery({ query }),
        placeholder: "Search connections…",
        isAutofocus: false,
        isLabelHidden: true
      },
      Option.none()
    ),
    ...(shown.length === 0
      ? [emptyList(model, h)]
      : [
          columns(h, { label: "Connection", cells: ["Authentication"] }),
          h.ul(
            [h.AriaLabel("Connections")],
            shown.map((item) => connectionRow(item, model, h))
          )
        ])
  ])
}

/**
 * What the list says when the workspace has no connection at all, and what a person who may add one can do about it.
 */
const noConnections = (model: Model, h: ConnectionsViewBuilder): Html =>
  paneEmpty(h, {
    icon: "mark-connections",
    title: "No connections yet",
    copy: mayCreate(model)
      ? "Connect the models, tools, sandboxes, harnesses, and channels your workspace works with."
      : "An administrator can connect models, tools, sandboxes, harnesses, and channels for your workspace."
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

/** The list, or what it says when the workspace has no connection; nothing before the connections are read. */
const listBody = (model: Model, h: ConnectionsViewBuilder): Html => {
  if (!model.isLoaded) {
    return h.empty
  }

  return model.connections.length === 0 ? noConnections(model, h) : connectionList(model, h)
}

/** The name of the workspace, which a phone shows under the title. */
export type ListInputs = Readonly<{ workspaceName: string }>

/**
 * The connections as the list page, the main content: All and each thing a connection gives on a tab, with how many
 * connections each holds, a search that narrows the tab by the name of a connection or of its integration, and a row
 * for each connection, which picking opens as its own page.
 */
export const view = ConnectionsComposition.makeView.withInputs<ListInputs>((model, { workspaceName }, h) =>
  pane(h, {
    variant: "main",
    label: "Connections",
    header: {
      title: "Connections",
      icon: "mark-connections",
      phoneContext: workspaceName,
      tabs: browseTabs(model, h)
    },
    body: [
      paneColumn(
        h,
        [notice(h, model.notice), mayCreate(model) ? integrationsView(model, h) : h.empty, listBody(model, h)],
        { isWide: true }
      )
    ]
  })
)

/** The connection whose page it is, and the name of the workspace, which a phone shows under the title. */
export type ConnectionInputs = Readonly<{
  connectionId: ConnectionContract.ConnectionId
  workspaceName: string
}>

/** The failure the edit holds about `action`, when it holds one. */
const failureAbout = (edit: Option.Option<Edit>, action: ConnectionsAction): Option.Option<Failure> =>
  Option.filter(
    Option.flatMap(edit, (open) => open.failure),
    (failure) => failure.action === action
  )

/** Whether the edit has the action `action` on its way. */
const isSaving = (edit: Option.Option<Edit>, action: ConnectionsAction): boolean =>
  Option.exists(edit, (open) => Option.exists(open.saving, (saving) => saving === action))

/**
 * Why the connection can't be used as it is, as a note over the page: its integration is not installed, or refuses its
 * setup.
 */
const readinessNote = (item: ConnectionItem, model: Model, h: ConnectionsViewBuilder): Html =>
  item.pending
    ? h.empty
    : Connection.Readiness.match(item.connection.readiness, {
        Ready: () => h.empty,
        Invalid: ({ description }) =>
          noticeBox(h, {
            title: `${Option.match(integrationOf(model, item), { onNone: () => "Its integration", onSome: ({ name }) => name })} refuses this setup`,
            lines: [description]
          }),
        Uninstalled: () =>
          noticeBox(h, {
            title: "Its integration isn't installed on this host",
            lines: ["Nothing can use this connection. Its settings stay until it is removed."],
            tone: "danger"
          })
      })

/**
 * Whether the connection works, as its system answers: what the last check found, in place, with the button that
 * asks, for a person who may manage a connection that can be used.
 */
const checkSection = (item: ConnectionItem, model: Model, h: ConnectionsViewBuilder): Html => {
  const connectionId = item.connection.id
  const system = Option.match(integrationOf(model, item), {
    onNone: () => "its integration",
    onSome: ({ name }) => name
  })
  const check = checkOf(model, connectionId)
  const isChecking = Option.exists(check, Check.isAnyOf(["Checking"]))
  const hasResult = Option.exists(check, Check.isAnyOf(["Checked"]))

  return paneSection(h, {
    title: "Check",
    hasStitch: true,
    children: [
      h.div(
        [h.Role("status")],
        [
          Option.match(check, {
            onNone: () => hint(h, `Ask ${system} whether this connection works as it is set up.`),
            onSome: Check.match({
              Checking: () => hint(h, `Checking with ${system}…`),
              Checked: ({ health }) =>
                noticeBox(h, {
                  title: healthWording[health.status].title,
                  lines: [health.description ?? healthWording[health.status].line],
                  tone: healthWording[health.status].tone
                }),
              Failed: () => h.empty
            })
          })
        ]
      ),
      failureView(
        Option.flatMap(check, (found) =>
          Check.matchOrElse(found, { Failed: ({ failure }) => Option.some(failure) }, () => Option.none())
        ),
        h
      ),
      buttonRow(h, [
        button(h, hasResult ? "Check again" : "Check connection", Message.ClickedCheck({ connectionId }), {
          isDisabled: isChecking
        })
      ])
    ]
  })
}

/** The form that renames the connection, where the person may; for another, the name alone. */
const nameForm = (
  item: ConnectionItem,
  model: Model,
  edit: Option.Option<Edit>,
  isEditable: boolean,
  h: ConnectionsViewBuilder
): Html => {
  const connectionId = item.connection.id
  const saving = isSaving(edit, "Rename")

  return form(h, { onSubmit: Message.SubmittedName({ connectionId }), label: "Name", variant: "pane" }, [
    field(
      h,
      {
        id: "connection-name",
        label: "Connection name",
        type: "text",
        value: nameDraftOf(model, item),
        isAutofocus: false,
        isDisabled: !isEditable || saving,
        onInput: (name) => Message.TypedName({ connectionId, name })
      },
      Option.none()
    ),
    failureView(failureAbout(edit, "Rename"), h),
    ...(isEditable
      ? [
          buttonRow(h, [
            submit(h, "Save name", { variant: "secondary", isDisabled: !isNameChanged(model, item) || saving })
          ])
        ]
      : [])
  ])
}

/**
 * What the connection's integration asks of its settings, as a form where the person may change them; for another, the
 * settings alone.
 */
const settingsSection = (
  item: ConnectionItem,
  model: Model,
  edit: Option.Option<Edit>,
  isEditable: boolean,
  h: ConnectionsViewBuilder
): Html => {
  const connectionId = item.connection.id
  const saving = isSaving(edit, "Configure")
  const installed = integrationOf(model, item)
  const draft = settingsDraftOf(model, item)

  if (Option.isSome(installed) && Option.isSome(draft)) {
    if (SettingsForm.fieldsOf(installed.value.settings).length === 0) {
      return h.empty
    }

    return paneForm(h, { title: "Settings", onSubmit: Message.SubmittedSettings({ connectionId }), hasStitch: true }, [
      ...settingsFields(h, {
        idPrefix: "connection-setting",
        settings: installed.value.settings,
        draft: draft.value,
        isDisabled: !isEditable || saving,
        onChange: (name, value) => Message.ChangedSetting({ connectionId, name, value })
      }),
      failureView(failureAbout(edit, "Configure"), h),
      ...(isEditable
        ? [buttonRow(h, [submit(h, "Save settings", { isDisabled: !isSettingsChanged(model, item) || saving })])]
        : [])
    ])
  }

  const saved = Object.entries(item.connection.settings)

  return isUninstalled(item) && saved.length > 0
    ? paneSection(h, {
        title: "Saved settings",
        hasStitch: true,
        children: [
          detailList(
            h,
            saved.map(([key, value]) => ({ label: key, value: String(value) }))
          )
        ]
      })
    : h.empty
}

/** How the connection authenticates; its key is only ever replaced, never shown. */
const authenticationSection = (item: ConnectionItem, h: ConnectionsViewBuilder): Html =>
  paneSection(h, {
    title: "Authentication",
    hasStitch: true,
    children: [
      item.connection.auth === "apiKey"
        ? settingRow(h, { label: "API key saved", copy: "The stored key cannot be viewed or copied." })
        : settingRow(h, {
            label: "No authentication",
            copy: "Requests through this connection carry no credentials."
          })
    ]
  })

/**
 * What the connection's page says about it that is not set up by the person: its integration, what it gives, and who
 * made it and when.
 */
const detailsSection = (item: ConnectionItem, model: Model, h: ConnectionsViewBuilder): Html => {
  const { connection } = item
  const integration = integrationOf(model, item)

  return paneSection(h, {
    title: "Details",
    hasStitch: true,
    children: [
      detailList(h, [
        {
          label: "Integration",
          value: Option.match(integration, {
            onNone: () => (isUninstalled(item) ? `${connection.integration} · Not installed` : connection.integration),
            onSome: ({ name, docs }) =>
              docs === undefined ? name : h.span([], [`${name} · `, link(h, { label: "Documentation", href: docs })])
          })
        },
        ...Option.match(integration, {
          onNone: () => [],
          onSome: ({ provides }) => [{ label: "Gives", value: providesLabel(provides) }]
        }),
        {
          label: "Created by",
          value: `${memberName(model.members, connection.createdBy)} · ${calendarDate(connection.createdAt)}`
        }
      ])
    ]
  })
}

/**
 * The page of a connection: why it can't be used, whether it works, its name, its settings, how it authenticates, and
 * its details, in one column.
 */
const connectionPage = (item: ConnectionItem, model: Model, workspaceName: string, h: ConnectionsViewBuilder): Html => {
  const edit = findEdit(model, item.connection.id)
  const isEditable = mayManage(model, item) && !item.pending

  return pane(h, {
    variant: "main",
    label: item.connection.name,
    header: {
      title: item.connection.name,
      icon: "mark-connections",
      phoneContext: workspaceName,
      ...(item.pending ? { context: "Sending…" } : {})
    },
    body: [
      paneColumn(h, [
        readinessNote(item, model, h),
        isEditable && Connection.Readiness.isAnyOf(["Ready"])(item.connection.readiness)
          ? checkSection(item, model, h)
          : h.empty,
        nameForm(item, model, edit, isEditable, h),
        settingsSection(item, model, edit, isEditable, h),
        authenticationSection(item, h),
        detailsSection(item, model, h)
      ])
    ]
  })
}

/**
 * What the page of a connection says when the workspace does not list it: it was removed, or the person can no longer
 * see it.
 */
const missingConnection = (workspaceName: string, h: ConnectionsViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Connection",
    header: { title: "Connection", icon: "mark-connections", phoneContext: workspaceName },
    body: [
      paneEmpty(h, {
        icon: "mark-connections",
        title: "This connection isn't here",
        copy: "It may have been removed, or you can no longer see it.",
        action: button(h, "Show all connections", Message.ClickedBrowse({ tab: "all" }))
      })
    ]
  })

/**
 * The page of one connection, the main content: why it can't be used, whether it works, its name, its settings, how
 * it authenticates, and its details. A person who may manage it checks it, renames it, and changes its settings, each
 * saved apart; another reads the same values. A connection the workspace does not list says so, and offers the list;
 * nothing shows before the connections are read.
 */
export const connectionView = ConnectionsComposition.makeView.withInputs<ConnectionInputs>(
  (model, { connectionId, workspaceName }, h) =>
    Option.match(findConnection(model, connectionId), {
      onNone: () =>
        model.isLoaded
          ? missingConnection(workspaceName, h)
          : pane(h, {
              variant: "main",
              label: "Connection",
              header: { title: "Connection", icon: "mark-connections", phoneContext: workspaceName },
              body: []
            }),
      onSome: (item) => connectionPage(item, model, workspaceName, h)
    })
)

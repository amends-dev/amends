import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import {
  button,
  buttonRow,
  choiceSelect,
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
import { modal, modalList } from "@amends-dev/design/modal"
import { pane, paneColumn, paneEmpty, paneForm, paneSection, paneTabs } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { calendarDate, memberName } from "../../seen.ts"
import * as SettingsForm from "../../settingsForm.ts"
import { ConnectionsComposition, type ConnectionsViewBuilder, DialogBinding } from "./composition.ts"
import {
  Adding,
  areIntegrationsListed,
  Check,
  checkOf,
  type Choosing,
  type Configuring,
  type ConnectionItem,
  type ConnectionsAction,
  type ConnectionsTab,
  connectionItemsGiving,
  connectionsOnTab,
  type Edit,
  type Failure,
  findConnection,
  findEdit,
  findIntegration,
  Integrations,
  integrationOf,
  integrationsToAdd,
  isNameChanged,
  isSettingsChanged,
  isUninstalled,
  mayAdd,
  mayCreate,
  mayManage,
  Message,
  type Model,
  nameDraftOf,
  type Removing,
  type Replacing,
  settingsDraftOf,
  settingsToAdd,
  shownConnections,
  shownIntegrations
} from "./definition.ts"
import { settingsFields } from "./settingsFields.ts"
import {
  addLabel,
  authLabels,
  authOptionsLabel,
  capabilityLabels,
  connectionsMessage,
  connectionStatus,
  healthWording,
  integrationLine,
  needsRefresh,
  providesLabel,
  tabLabel
} from "./wording.ts"

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
            ),
            ...(mayAdd(model)
              ? [
                  iconButton(
                    h,
                    {
                      icon: "mark-new",
                      label: addLabel(Option.some(capability)),
                      onClick: Message.ClickedAdd({ capability: Option.some(capability) })
                    },
                    { size: "compact" }
                  )
                ]
              : [])
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
      actions: mayAdd(model) ? [button(h, "Add connection", Message.ClickedAdd({ capability: Option.none() }))] : [],
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
const authenticationSection = (
  item: ConnectionItem,
  model: Model,
  isEditable: boolean,
  h: ConnectionsViewBuilder
): Html =>
  paneSection(h, {
    title: "Authentication",
    hasStitch: true,
    children:
      item.connection.auth === "apiKey"
        ? [
            settingRow(h, { label: "API key saved", copy: "The stored key cannot be viewed or copied." }),
            ...(isEditable && Option.isSome(integrationOf(model, item))
              ? [
                  buttonRow(h, [
                    button(h, "Replace key", Message.ClickedReplaceKey({ connectionId: item.connection.id }))
                  ])
                ]
              : [])
          ]
        : [
            settingRow(h, {
              label: "No authentication",
              copy: "Requests through this connection carry no credentials."
            })
          ]
  })

/** What removing the connection does, and the button that asks to confirm it, for a person who may manage it. */
const removalSection = (item: ConnectionItem, isEditable: boolean, h: ConnectionsViewBuilder): Html =>
  isEditable
    ? paneSection(h, {
        title: "Removal",
        hasStitch: true,
        children: [
          hint(
            h,
            item.connection.auth === "apiKey"
              ? "Removing this connection removes it from the workspace, along with its saved key."
              : "Removing this connection removes it from the workspace."
          ),
          buttonRow(h, [button(h, "Remove connection", Message.ClickedRemove({ connectionId: item.connection.id }))])
        ]
      })
    : h.empty

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
        authenticationSection(item, model, isEditable, h),
        detailsSection(item, model, h),
        removalSection(item, isEditable, h)
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

/** The name of the workspace, which the dialog that adds a connection says it adds the connection to. */
export type DialogInputs = Readonly<{ workspaceName: string }>

/**
 * The dialog's first step of adding a connection: the integrations the host installs, narrowed to what the person
 * asked for from a sidebar section and by a search, each with what it gives and how it authenticates.
 */
const choosingModal = (
  render: RenderInfo,
  choosing: Choosing,
  model: Model,
  workspaceName: string,
  h: ConnectionsViewBuilder
): Html => {
  const noun = Option.match(choosing.capability, {
    onNone: () => "",
    onSome: (capability) => ` that gives ${capabilityLabels[capability].toLowerCase()}`
  })
  const shown = shownIntegrations(model, choosing)
  const search = choosing.query.trim()

  return modal(h, render, {
    title: addLabel(choosing.capability),
    context: workspaceName,
    width: "wide",
    body:
      integrationsToAdd(model, choosing.capability).length === 0
        ? [
            settingRow(h, {
              label: "No integrations available",
              copy: `This host installs no integration${noun}.`
            })
          ]
        : [
            field(
              h,
              {
                id: "search-integrations",
                label: "Search integrations",
                type: "search",
                value: choosing.query,
                placeholder: "Search integrations…",
                isAutofocus: false,
                isLabelHidden: true,
                attributes: render.initialFocus,
                onInput: (query) => Message.TypedIntegrationQuery({ query })
              },
              Option.none()
            ),
            shown.length === 0
              ? column(h, [
                  hint(h, `No integrations match “${search}”.`),
                  buttonRow(h, [
                    button(h, "Clear search", Message.TypedIntegrationQuery({ query: "" }), { variant: "quiet" })
                  ])
                ])
              : modalList(
                  h,
                  "Integrations",
                  shown.map((integration) =>
                    row(h, {
                      mark: { icon: "mark-connections" },
                      markSize: "md",
                      title: integration.name,
                      meta: `${providesLabel(integration.provides)} · ${authOptionsLabel(integration.auth)}`,
                      onClick: Message.ChoseIntegration({ integrationId: integration.id })
                    })
                  )
                )
          ],
    cancelLabel: "Cancel"
  })
}

/**
 * The fields that choose how a connection authenticates and enter its key: a choice when the integration has several
 * ways, and the key where one is used.
 */
const authenticationFields = (
  configuring: Configuring,
  integration: Connection.IntegrationView,
  isSending: boolean,
  h: ConnectionsViewBuilder
): ReadonlyArray<Html> => [
  integration.auth.length > 1
    ? choiceSelect(h, {
        id: "add-connection-auth",
        label: "Authentication",
        choices: integration.auth.map((method) => [method, authLabels[method]] as const),
        value: configuring.auth,
        ...(configuring.auth === "none"
          ? { hint: "Use this only when the system accepts requests without credentials." }
          : {}),
        isDisabled: isSending,
        onChange: (value) =>
          Message.ChoseAuth({ auth: integration.auth.find((method) => method === value) ?? configuring.auth })
      })
    : settingRow(h, {
        label: authLabels[configuring.auth],
        copy:
          configuring.auth === "apiKey"
            ? `${integration.name} takes an API key.`
            : "Requests through this connection carry no credentials."
      }),
  ...(configuring.auth === "apiKey"
    ? [
        field(
          h,
          {
            id: "add-connection-key",
            label: "API key",
            type: "password",
            value: configuring.apiKey,
            hint: "Stored securely. Once saved, it cannot be viewed or copied.",
            isAutofocus: false,
            isDisabled: isSending,
            attributes: [h.Autocomplete("off"), h.Spellcheck(false)],
            onInput: (apiKey) => Message.TypedApiKey({ apiKey })
          },
          Option.none()
        )
      ]
    : [])
]

/**
 * The dialog's second step: the connection's name, the settings its integration asks for, how it authenticates, and
 * its key, all created together, with Back to the integrations. What could not be made shows under the fields, and the
 * values stay for another try.
 */
const configuringModal = (
  render: RenderInfo,
  configuring: Configuring,
  model: Model,
  h: ConnectionsViewBuilder
): Html => {
  const isSending = Option.isSome(configuring.creating)
  const integration = findIntegration(model, configuring.integrationId)

  return modal(h, render, {
    title: "Configure connection",
    context: Option.match(integration, {
      onNone: () => configuring.integrationId,
      onSome: ({ name, provides }) => `${name} · ${providesLabel(provides)}`
    }),
    body: [
      field(
        h,
        {
          id: "add-connection-name",
          label: "Connection name",
          type: "text",
          value: configuring.name,
          hint: "A name your workspace will recognize.",
          isAutofocus: false,
          isDisabled: isSending,
          attributes: [...render.initialFocus, h.Autocomplete("off")],
          onInput: (name) => Message.TypedAddingName({ name })
        },
        Option.none()
      ),
      ...Option.match(integration, {
        onNone: () => [],
        onSome: (installed) => [
          ...settingsFields(h, {
            idPrefix: "add-connection-setting",
            settings: installed.settings,
            draft: configuring.settings,
            isDisabled: isSending,
            onChange: (name, value) => Message.ChangedAddingSetting({ name, value })
          }),
          ...authenticationFields(configuring, installed, isSending, h)
        ]
      }),
      failureView(configuring.failure, h)
    ],
    footer: [
      button(h, "Back", Message.ClickedBack(), { variant: "quiet", isDisabled: isSending }),
      submit(h, isSending ? "Creating…" : "Create connection", {
        isDisabled:
          isSending || Option.isNone(Option.flatMap(integration, (installed) => settingsToAdd(installed, configuring)))
      })
    ],
    onSubmit: Message.SubmittedAdding()
  })
}

/** The dialog that adds a connection: the integrations to choose among, or the connection to the one chosen. */
const addingModal = (
  render: RenderInfo,
  adding: Adding,
  model: Model,
  workspaceName: string,
  h: ConnectionsViewBuilder
): Html =>
  Adding.match(adding, {
    Choosing: (choosing) => choosingModal(render, choosing, model, workspaceName, h),
    Configuring: (configuring) => configuringModal(render, configuring, model, h)
  })

/** The dialog that replaces a connection's key, saying the current key stays until the new one is saved. */
const replacingModal = (render: RenderInfo, replacing: Replacing, h: ConnectionsViewBuilder): Html =>
  modal(h, render, {
    title: "Replace API key",
    context: replacing.name,
    description: "The current key stays in place until the new key is saved.",
    body: [
      field(
        h,
        {
          id: "replace-connection-key",
          label: "New API key",
          type: "password",
          value: replacing.apiKey,
          hint: "Stored securely. Once saved, it cannot be viewed or copied.",
          isAutofocus: false,
          isDisabled: replacing.isSending,
          attributes: [...render.initialFocus, h.Autocomplete("off"), h.Spellcheck(false)],
          onInput: (apiKey) => Message.TypedNewKey({ apiKey })
        },
        Option.none()
      ),
      failureView(replacing.failure, h)
    ],
    cancelLabel: "Cancel",
    footer: [
      submit(h, replacing.isSending ? "Replacing…" : "Replace key", {
        isDisabled: replacing.isSending || replacing.apiKey.trim() === ""
      })
    ],
    onSubmit: Message.SubmittedNewKey()
  })

/** The dialog that confirms removing a connection, saying it leaves the workspace with its saved key, if it has one. */
const removingModal = (render: RenderInfo, removing: Removing, h: ConnectionsViewBuilder): Html =>
  modal(h, render, {
    title: "Remove connection?",
    context: removing.name,
    description: removing.hasKey
      ? `${removing.name} will be removed from the workspace, along with its saved key.`
      : `${removing.name} will be removed from the workspace.`,
    body: [failureView(removing.failure, h)],
    cancelLabel: "Cancel",
    footer: [submit(h, removing.isSending ? "Removing…" : "Remove connection", { isDisabled: removing.isSending })],
    onSubmit: Message.ConfirmedRemoval()
  })

/**
 * What the dialog shows: the form that adds a connection, the one that replaces a key, or the confirmation that removes
 * one; an empty frame while it has none.
 */
const dialogModal = (render: RenderInfo, model: Model, workspaceName: string, h: ConnectionsViewBuilder): Html =>
  Option.match(model.adding, {
    onSome: (adding) => addingModal(render, adding, model, workspaceName, h),
    onNone: () =>
      Option.match(model.replacing, {
        onSome: (replacing) => replacingModal(render, replacing, h),
        onNone: () =>
          Option.match(model.removing, {
            onSome: (removing) => removingModal(render, removing, h),
            onNone: () => modal(h, render, { title: "", body: [] })
          })
      })
  })

/**
 * The dialog for adding a connection, replacing its key, or confirming its removal, which the page lends the shell: it
 * renders its `dialog` element, with nothing in it while it is closed, wherever the page puts the buttons that open
 * it, the sidebar's, the list's, and the connection's, whether or not the sidebar is on the page.
 */
export const dialogView = ConnectionsComposition.makeView.withInputs<DialogInputs>((model, { workspaceName }, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "dialog",
      model: model.dialog,
      viewInputs: {
        hasDescription:
          Option.isNone(model.adding) && (Option.isSome(model.replacing) || Option.isSome(model.removing)),
        toView: (render) => dialogModal(render, model, workspaceName, h)
      }
    })
  )
)

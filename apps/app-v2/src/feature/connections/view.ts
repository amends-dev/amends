import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection, ConnectionPermissions } from "@amends-dev/core/connection"
import {
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  hint,
  iconButton,
  notice,
  sending,
  submit,
  toggle
} from "@amends-dev/design/control"
import { badge, entry, entryList } from "@amends-dev/design/details"
import type { MarkStatus } from "@amends-dev/design/mark"
import { pane, paneColumn, paneEmpty, paneForm } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { connectionTarget, may, workspaceTarget } from "../../permissions.ts"
import * as SettingsForm from "../../settingsForm.ts"
import { ConnectionsComposition, type ConnectionsViewBuilder } from "./composition.ts"
import {
  Check,
  checkOf,
  type ConnectionItem,
  connectionItemsGiving,
  findConnection,
  findIntegration,
  Form,
  Integrations,
  integrationsOf,
  Message,
  type Model
} from "./definition.ts"

/** How ready a connection is, as the badge beside its name says it and is toned. */
const readinessBadge = (readiness: Connection.Readiness, h: ConnectionsViewBuilder): Html =>
  Connection.Readiness.match(readiness, {
    Ready: () => badge(h, { label: "Ready", tone: "success" }),
    Invalid: () => badge(h, { label: "Can't be used", tone: "danger" }),
    Uninstalled: () => badge(h, { label: "Integration uninstalled", tone: "caution" })
  })

/** Why a connection can't be used, when it can't. */
const readinessNotes = (readiness: Connection.Readiness, h: ConnectionsViewBuilder): ReadonlyArray<Html> =>
  Connection.Readiness.match(readiness, {
    Ready: () => [],
    Invalid: ({ description }) => [hint(h, description)],
    Uninstalled: () => []
  })

/** What a check found, as the person reads it. */
const healthText = ({ status, description }: ConnectionContract.Health) => {
  const found = {
    healthy: "It answers",
    unauthorized: "It refused the key",
    misconfigured: "Its settings are wrong",
    unavailable: "It can't be reached"
  }[status]
  return description === undefined ? `${found}.` : `${found}: ${description}`
}

/** The fields of `settings`, each as the draft fills it in. */
const settingsFields = (
  settings: Connection.IntegrationView["settings"],
  draft: SettingsForm.Draft,
  h: ConnectionsViewBuilder
): ReadonlyArray<Html> =>
  SettingsForm.fieldsOf(settings).map(({ name, title, required, input }) => {
    const id = `setting-${name}`
    const label = required ? title : `${title} (optional)`
    const value = draft[name]
    const text = typeof value === "string" ? value : ""
    const onInput = (value: string) => Message.ChangedSetting({ name, value })
    return SettingsForm.Input.$match(input, {
      Toggle: () =>
        toggle(h, {
          id,
          label,
          isOn: value === true,
          onToggle: (isOn) => Message.ChangedSetting({ name, value: isOn })
        }),
      Text: () => field(h, { id, label, type: "text", value: text, onInput }, Option.none()),
      Number: () => field(h, { id, label, type: "number", value: text, onInput }, Option.none()),
      Choice: ({ choices }) => choiceSelect(h, { id, label, choices, value: text, onChange: onInput })
    })
  })

/** The form open among the connections. */
const formView = (open: Form, model: Model, h: ConnectionsViewBuilder): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelForm(), { variant: "quiet" })
  return Form.match(open, {
    Adding: ({ integrationId, name, auth, apiKey, settings, sending: isSending, error }) => {
      const integration = Option.getOrUndefined(findIntegration(model, integrationId))
      return paneForm(h, { title: "Add a connection", onSubmit: Message.SubmittedForm() }, [
        choiceSelect(h, {
          id: "connection-integration",
          label: "Integration",
          choices: [
            ["", "Choose an integration"] as const,
            ...integrationsOf(model).map(({ id, name }) => [id, name] as const)
          ],
          value: integrationId,
          onChange: (integrationId) => Message.ChoseIntegration({ integrationId })
        }),
        ...(integration === undefined
          ? []
          : [
              field(
                h,
                {
                  id: "connection-name",
                  label: "Name",
                  type: "text",
                  value: name,
                  onInput: (name) => Message.TypedName({ name })
                },
                Option.none()
              ),
              integration.auth.length > 1
                ? choiceSelect(h, {
                    id: "connection-auth",
                    label: "Authentication",
                    choices: integration.auth.map((method) => [method, SettingsForm.authLabels[method]] as const),
                    value: auth,
                    onChange: (auth) => Message.ChoseAuth({ auth })
                  })
                : h.empty,
              auth === "apiKey"
                ? field(
                    h,
                    {
                      id: "connection-key",
                      label: "API key",
                      type: "password",
                      value: apiKey,
                      onInput: (apiKey) => Message.TypedApiKey({ apiKey })
                    },
                    Option.none()
                  )
                : h.empty,
              ...settingsFields(integration.settings, settings, h)
            ]),
        notice(h, error),
        buttonRow(h, [isSending ? hint(h, "Adding…") : submit(h, "Add"), cancel])
      ])
    },
    Renaming: ({ name }) =>
      paneForm(h, { title: "Rename the connection", onSubmit: Message.SubmittedForm() }, [
        field(
          h,
          {
            id: "connection-rename",
            label: "Name",
            type: "text",
            value: name,
            onInput: (name) => Message.TypedName({ name })
          },
          Option.none()
        ),
        buttonRow(h, [submit(h, "Save"), cancel])
      ]),
    Configuring: ({ connectionId, settings, error }) => {
      const integration = Option.getOrUndefined(
        Option.flatMap(findConnection(model, connectionId), ({ connection }) =>
          findIntegration(model, connection.integration)
        )
      )
      return paneForm(h, { title: "Change the connection's settings", onSubmit: Message.SubmittedForm() }, [
        ...(integration === undefined ? [] : settingsFields(integration.settings, settings, h)),
        notice(h, error),
        buttonRow(h, [submit(h, "Save"), cancel])
      ])
    },
    ReplacingKey: ({ apiKey, sending: isSending, error }) =>
      paneForm(h, { title: "Replace the connection's key", onSubmit: Message.SubmittedForm() }, [
        field(
          h,
          {
            id: "connection-new-key",
            label: "New API key",
            type: "password",
            value: apiKey,
            onInput: (apiKey) => Message.TypedApiKey({ apiKey })
          },
          Option.none()
        ),
        notice(h, error),
        buttonRow(h, [isSending ? hint(h, "Replacing…") : submit(h, "Replace"), cancel])
      ])
  })
}

/** What the last check of a connection found, while the person has one. */
const checkViews = (model: Model, item: ConnectionItem, h: ConnectionsViewBuilder): ReadonlyArray<Html> =>
  Option.match(checkOf(model, item.connection.id), {
    onNone: () => [],
    onSome: Check.match({
      Checking: () => [hint(h, "Checking…")],
      Checked: ({ health }) => [hint(h, healthText(health))],
      Failed: ({ error }) => [notice(h, Option.some(error))]
    })
  })

/** A connection, with its integration, how ready it is, what the last check found, and what the person may do with it. */
const connectionEntry = (item: ConnectionItem, model: Model, h: ConnectionsViewBuilder): Html => {
  const { connection, pending } = item
  const integration = Option.getOrUndefined(findIntegration(model, connection.integration))
  const hasSettings = integration !== undefined && SettingsForm.fieldsOf(integration.settings).length > 0
  const manageable = may(model.grants, ConnectionPermissions.Manage, connectionTarget(model.workspaceId, connection.id))
  const buttons =
    manageable && !pending
      ? [
          button(h, "Rename", Message.ClickedRename({ connectionId: connection.id }), { variant: "quiet" }),
          ...(hasSettings
            ? [
                button(h, "Change settings", Message.ClickedConfigure({ connectionId: connection.id }), {
                  variant: "quiet"
                })
              ]
            : []),
          ...(connection.auth === "apiKey"
            ? [
                button(h, "Replace key", Message.ClickedReplaceKey({ connectionId: connection.id }), {
                  variant: "quiet"
                })
              ]
            : []),
          button(h, "Check", Message.ClickedCheck({ connectionId: connection.id }), { variant: "quiet" }),
          button(h, "Remove", Message.ClickedRemove({ connectionId: connection.id }), { variant: "quiet" })
        ]
      : []

  return entry(h, {
    key: connection.id,
    title: connection.name,
    trailing: [
      badge(h, { label: integration?.name ?? connection.integration }),
      readinessBadge(connection.readiness, h),
      sending(h, pending)
    ],
    children: [
      ...readinessNotes(connection.readiness, h),
      ...checkViews(model, item, h),
      ...(buttons.length === 0 ? [] : [buttonRow(h, buttons)])
    ]
  })
}

/** The host's integrations while the person waits for them, or why they could not be listed, with a way to ask again. */
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

/** Whether the person may add a connection, once the host listed its integrations to add one to. */
const mayAdd = (model: Model): boolean =>
  may(model.grants, ConnectionPermissions.Create, workspaceTarget(model.workspaceId)) &&
  integrationsOf(model).length > 0

/** Adding a connection, for a person who may, until a form opens. */
const addActions = (model: Model, h: ConnectionsViewBuilder): ReadonlyArray<Html> =>
  Option.isNone(model.form) && mayAdd(model)
    ? [button(h, "Add a connection", Message.ClickedAdd(), { variant: "secondary" })]
    : []

/**
 * How a connection stands, as the shape at the end of its row says it: Needs setup, with why, when it can't be used,
 * and Unavailable when its integration isn't installed on this host. A connection that is ready shows nothing, and
 * so does one still on its way.
 */
const statusOf = ({ connection, pending }: ConnectionItem): MarkStatus | undefined =>
  pending
    ? undefined
    : Connection.Readiness.match(connection.readiness, {
        Ready: () => undefined,
        Invalid: ({ description }): MarkStatus => ({ kind: "attention", label: "Needs setup", detail: description }),
        Uninstalled: (): MarkStatus => ({
          kind: "blocked",
          label: "Unavailable",
          detail: "Its integration isn't installed on this host."
        })
      })

/** Whether the sidebar may say a section has no connections: they and the integrations that say what they give are read. */
const isReadForSections = (model: Model): boolean =>
  model.isLoaded && Integrations.isAnyOf(["Loaded"])(model.integrations)

/** The sections of the sidebar that list connections, one for each thing a connection can give the workspace. */
const capabilitySections = [
  { capability: "models", title: "Models", noun: "model" },
  { capability: "tools", title: "Tools", noun: "tool" },
  { capability: "sandboxes", title: "Sandboxes", noun: "sandbox" },
  { capability: "harnesses", title: "Harnesses", noun: "harness" }
] as const

/** Whether the channels are the destination open, which marks the Channels title current. */
export type SidebarInputs = Readonly<{ isChannelsOpen: boolean }>

/**
 * The sidebar of the connections: a section for each thing a connection gives, Models, Tools, Sandboxes, and
 * Harnesses, listing the connections whose integration gives it, so one that gives two is in both, each with its
 * status at the end of its row, and then Channels, with a way to browse them. A title opens the connections, a
 * Browse button does, and so does an Add button, for a person who may add one, since the form it opens is in the
 * connections; picking a connection opens them too. An empty section says so once the connections and the
 * integrations are read.
 */
export const sidebarView = ConnectionsComposition.makeView.withInputs<SidebarInputs>((model, { isChannelsOpen }, h) =>
  sidebarSections(h, [
    ...capabilitySections.map(({ capability, title, noun }) => {
      const listed = connectionItemsGiving(model, capability)
      return sidebarSection(h, {
        label: title,
        onTitleClick: Message.ClickedBrowse(),
        actions: [
          iconButton(
            h,
            { icon: "list", label: `Browse ${title.toLowerCase()}`, onClick: Message.ClickedBrowse() },
            { size: "compact" }
          ),
          ...(mayAdd(model)
            ? [
                iconButton(
                  h,
                  { icon: "mark-new", label: `Add ${noun} connection`, onClick: Message.ClickedAdd() },
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
                  status: statusOf(item),
                  label: item.connection.name,
                  isPending: item.pending,
                  isCurrent: false,
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

/** The workspace's connections, the form open among them, and adding one, for a person who may. */
export const view = ConnectionsComposition.makeView((model, h) =>
  pane(h, {
    variant: "main",
    label: "Connections",
    header: { title: "Connections", icon: "mark-connections", actions: addActions(model, h) },
    body: [
      paneColumn(h, [
        notice(h, model.notice),
        integrationsView(model, h),
        model.connections.length === 0
          ? paneEmpty(h, {
              icon: "mark-connections",
              title: "No connections yet",
              copy: "Connections give the workspace models, tools, sandboxes, harnesses, and channels."
            })
          : entryList(h, {
              label: "Connections",
              children: model.connections.map((item) => connectionEntry(item, model, h))
            }),
        Option.match(model.form, { onNone: () => h.empty, onSome: (open) => formView(open, model, h) })
      ])
    ]
  })
)

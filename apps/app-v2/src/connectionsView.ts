/**
 * The workspace's connections, each with its integration, how ready it is, and, for a person who may
 * manage it, renaming it, changing its settings, replacing its key, checking it with its system, and
 * removing it; and adding one, to an integration the host installs, for a person who may.
 */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { Target } from "@amends-dev/core/authorization"
import { Connection, ConnectionPermissions } from "@amends-dev/core/connection"
import type { ReplicaRecord } from "@amends-dev/core/replica"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { button, choiceSelect, errorView, field, sending, submit, toggle } from "./controls.ts"
import { Message } from "./message.ts"
import { Check, ConnectionForm, type Connections, Integrations, type Opened } from "./model.ts"
import { may } from "./permissions.ts"
import * as SettingsForm from "./settingsForm.ts"

/** How ready a connection is, as the person reads it. */
const readinessText = (readiness: Connection.Readiness) =>
  Connection.Readiness.match(readiness, {
    Ready: () => "Ready",
    Invalid: ({ description }) => `Can't be used: ${description}`,
    Uninstalled: () => "Its integration is no longer installed"
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

/** The integrations the host installs, once it listed them. */
const integrationsOf = (opened: Opened): ReadonlyArray<Connection.IntegrationView> =>
  Option.match(opened.integrations, {
    onNone: () => [],
    onSome: Integrations.matchOrElse({ Loaded: ({ integrations }) => integrations }, () => [])
  })

/** The fields of `form`, each as the draft fills it in. */
const settingsFields = (
  form: Connection.IntegrationView["settings"],
  draft: SettingsForm.Draft,
  h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
  SettingsForm.fieldsOf(form).map(({ name, title, required, input }) => {
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
const formView = (form: ConnectionForm, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelConnectionForm())
  return ConnectionForm.match(form, {
    Adding: ({ integrationId, name, auth, apiKey, settings, sending: isSending, error }) => {
      const integration = integrationsOf(opened).find(({ id }) => id === integrationId)
      return h.form(
        [h.OnSubmit(Message.SubmittedConnectionForm()), h.AriaLabel("Add a connection")],
        [
          choiceSelect(h, {
            id: "connection-integration",
            label: "Integration",
            choices: [
              ["", "Choose an integration"] as const,
              ...integrationsOf(opened).map(({ id, name }) => [id, name] as const)
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
                    onInput: (name) => Message.TypedConnectionName({ name })
                  },
                  Option.none()
                ),
                integration.auth.length > 1
                  ? choiceSelect(h, {
                      id: "connection-auth",
                      label: "Authentication",
                      choices: integration.auth.map((method) => [method, SettingsForm.authLabels[method]] as const),
                      value: auth,
                      onChange: (auth) => Message.ChoseConnectionAuth({ auth })
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
          errorView(error, h),
          isSending ? h.p([], ["Adding…"]) : submit(h, "Add"),
          cancel
        ]
      )
    },
    Renaming: ({ name }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedConnectionForm()), h.AriaLabel("Rename the connection")],
        [
          field(
            h,
            {
              id: "connection-rename",
              label: "Name",
              type: "text",
              value: name,
              onInput: (name) => Message.TypedConnectionName({ name })
            },
            Option.none()
          ),
          submit(h, "Save"),
          cancel
        ]
      ),
    Configuring: ({ connectionId, settings, error }) => {
      const connection = opened.connections.find((item) => item.connection.id === connectionId)?.connection
      const integration = integrationsOf(opened).find(({ id }) => id === connection?.integration)
      return h.form(
        [h.OnSubmit(Message.SubmittedConnectionForm()), h.AriaLabel("Change the connection's settings")],
        [
          ...(integration === undefined ? [] : settingsFields(integration.settings, settings, h)),
          errorView(error, h),
          submit(h, "Save"),
          cancel
        ]
      )
    },
    ReplacingKey: ({ apiKey, sending: isSending, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedConnectionForm()), h.AriaLabel("Replace the connection's key")],
        [
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
          errorView(error, h),
          isSending ? h.p([], ["Replacing…"]) : submit(h, "Replace"),
          cancel
        ]
      )
  })
}

/** A connection, with how ready it is, what the last check found, and what the person may do with it. */
const connectionView = (
  { connection, pending }: { readonly connection: ReplicaRecord.Connection; readonly pending: boolean },
  connections: Connections,
  opened: Opened,
  h: HtmlBuilder<Message>
): Html => {
  const integration = integrationsOf(opened).find(({ id }) => id === connection.integration)
  const manageable = may(
    opened,
    ConnectionPermissions.Manage,
    Target.Reference.cases.Connection.make({ workspaceId: opened.workspace.id, connectionId: connection.id })
  )
  const check = Option.filter(connections.check, ({ connectionId }) => connectionId === connection.id)
  const hasSettings = integration !== undefined && SettingsForm.fieldsOf(integration.settings).length > 0
  return h.keyed("li")(
    connection.id,
    [],
    [
      h.p(
        [],
        [
          h.strong([], [connection.name]),
          ` · ${integration?.name ?? connection.integration} · ${readinessText(connection.readiness)}`,
          sending(pending, h)
        ]
      ),
      Option.match(check, {
        onNone: () => h.empty,
        onSome: ({ check }) =>
          Check.match(check, {
            Checking: () => h.p([], ["Checking…"]),
            Checked: ({ health }) => h.p([], [healthText(health)]),
            Failed: ({ error }) => h.p([h.Role("alert")], [error])
          })
      }),
      ...(manageable && !pending
        ? [
            button(h, "Rename", Message.ClickedRenameConnection({ connectionId: connection.id })),
            hasSettings
              ? button(h, "Change settings", Message.ClickedConfigureConnection({ connectionId: connection.id }))
              : h.empty,
            connection.auth === "apiKey"
              ? button(h, "Replace key", Message.ClickedReplaceKey({ connectionId: connection.id }))
              : h.empty,
            button(h, "Check", Message.ClickedCheckConnection({ connectionId: connection.id })),
            button(h, "Remove", Message.ClickedRemoveConnection({ connectionId: connection.id }))
          ]
        : [])
    ]
  )
}

/** The workspace's connections, the form open among them, and adding one, for a person who may. */
export const connectionsView = (connections: Connections, opened: Opened, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel("Connections")],
    [
      h.h3([], ["Connections"]),
      Option.match(opened.integrations, {
        onNone: () => h.empty,
        onSome: Integrations.match({
          Loading: () => h.p([], ["Loading the integrations…"]),
          Loaded: () => h.empty,
          Failed: ({ error }) => h.p([h.Role("alert")], [error])
        })
      }),
      opened.connections.length === 0
        ? h.p([], ["No connections yet."])
        : h.ul(
            [],
            opened.connections.map((item) => connectionView(item, connections, opened, h))
          ),
      Option.match(connections.form, {
        onSome: (form) => formView(form, opened, h),
        onNone: () =>
          may(
            opened,
            ConnectionPermissions.Create,
            Target.Reference.cases.Workspace.make({ workspaceId: opened.workspace.id })
          ) && integrationsOf(opened).length > 0
            ? button(h, "Add a connection", Message.ClickedAddConnection())
            : h.empty
      })
    ]
  )

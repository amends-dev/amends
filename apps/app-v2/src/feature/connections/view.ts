import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection, ConnectionPermissions } from "@amends-dev/core/connection"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, choiceSelect, errorView, field, sending, submit, toggle } from "../../controls.ts"
import { connectionTarget, may, workspaceTarget } from "../../permissions.ts"
import * as SettingsForm from "../../settingsForm.ts"
import { ConnectionsComposition, type ConnectionsViewBuilder } from "./composition.ts"
import {
  Check,
  checkOf,
  type ConnectionItem,
  findConnection,
  findIntegration,
  Form,
  Integrations,
  integrationsOf,
  Message,
  type Model
} from "./definition.ts"

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
const formView = (form: Form, model: Model, h: ConnectionsViewBuilder): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelForm())
  return Form.match(form, {
    Adding: ({ integrationId, name, auth, apiKey, settings, sending: isSending, error }) => {
      const integration = Option.getOrUndefined(findIntegration(model, integrationId))
      return h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Add a connection")],
        [
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
          errorView(error, h),
          isSending ? h.p([], ["Adding…"]) : submit(h, "Add"),
          cancel
        ]
      )
    },
    Renaming: ({ name }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Rename the connection")],
        [
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
          submit(h, "Save"),
          cancel
        ]
      ),
    Configuring: ({ connectionId, settings, error }) => {
      const integration = Option.getOrUndefined(
        Option.flatMap(findConnection(model, connectionId), ({ connection }) =>
          findIntegration(model, connection.integration)
        )
      )
      return h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Change the connection's settings")],
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
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Replace the connection's key")],
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
const connectionView = ({ connection, pending }: ConnectionItem, model: Model, h: ConnectionsViewBuilder): Html => {
  const integration = Option.getOrUndefined(findIntegration(model, connection.integration))
  const hasSettings = integration !== undefined && SettingsForm.fieldsOf(integration.settings).length > 0
  const manageable = may(model.grants, ConnectionPermissions.Manage, connectionTarget(model.workspaceId, connection.id))
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
      Option.match(checkOf(model, connection.id), {
        onNone: () => h.empty,
        onSome: Check.match({
          Checking: () => h.p([], ["Checking…"]),
          Checked: ({ health }) => h.p([], [healthText(health)]),
          Failed: ({ error }) => h.p([h.Role("alert")], [error])
        })
      }),
      ...(manageable && !pending
        ? [
            button(h, "Rename", Message.ClickedRename({ connectionId: connection.id })),
            hasSettings
              ? button(h, "Change settings", Message.ClickedConfigure({ connectionId: connection.id }))
              : h.empty,
            connection.auth === "apiKey"
              ? button(h, "Replace key", Message.ClickedReplaceKey({ connectionId: connection.id }))
              : h.empty,
            button(h, "Check", Message.ClickedCheck({ connectionId: connection.id })),
            button(h, "Remove", Message.ClickedRemove({ connectionId: connection.id }))
          ]
        : [])
    ]
  )
}

/** The workspace's connections, the form open among them, and adding one, for a person who may. */
export const view = ConnectionsComposition.makeView((model, h) =>
  h.section(
    [h.AriaLabel("Connections")],
    [
      h.h3([], ["Connections"]),
      errorView(model.notice, h),
      Integrations.match(model.integrations, {
        Loading: () => h.p([], ["Loading the integrations…"]),
        Loaded: () => h.empty,
        Failed: ({ error }) =>
          h.div([], [h.p([h.Role("alert")], [error]), button(h, "Try again", Message.ClickedReloadIntegrations())])
      }),
      model.connections.length === 0
        ? h.p([], ["No connections yet."])
        : h.ul(
            [],
            model.connections.map((item) => connectionView(item, model, h))
          ),
      Option.match(model.form, {
        onSome: (form) => formView(form, model, h),
        onNone: () =>
          may(model.grants, ConnectionPermissions.Create, workspaceTarget(model.workspaceId)) &&
          integrationsOf(model).length > 0
            ? button(h, "Add a connection", Message.ClickedAdd())
            : h.empty
      })
    ]
  )
)

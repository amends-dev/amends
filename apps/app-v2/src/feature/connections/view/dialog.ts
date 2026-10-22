/** Add a connection, replace its key, or confirm its removal. */

import type { Connection } from "@amends-dev/core/connection"
import { button, buttonRow, choiceSelect, column, field, hint, submit } from "@amends-dev/design/control"
import { row } from "@amends-dev/design/directory"
import { settingRow } from "@amends-dev/design/form"
import { modal, modalList } from "@amends-dev/design/modal"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { findIntegration } from "../../../data/connections.ts"
import { ConnectionsBlock } from "../block.ts"
import { type ConnectionsViewBuilder, DialogBinding } from "../composition.ts"
import {
  Adding,
  type Choosing,
  type Configuring,
  integrationsToAdd,
  Message,
  type Model,
  type Removing,
  type Replacing,
  settingsToAdd,
  shownIntegrations
} from "../definition.ts"
import { failureView } from "./feedback.ts"
import { settingsFields } from "./settingsFields.ts"
import { addLabel, authLabels, authOptionsLabel, capabilityLabels, providesLabel } from "./wording.ts"

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
    size: "form",
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
    leading: [button(h, "Back", Message.ClickedBack(), { variant: "quiet", isDisabled: isSending })],
    footer: [
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
    size: "compact",
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
    isCancelLeading: true,
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
    size: "compact",
    context: removing.name,
    description: removing.hasKey
      ? `${removing.name} will be removed from the workspace, along with its saved key.`
      : `${removing.name} will be removed from the workspace.`,
    body: [failureView(removing.failure, h)],
    cancelLabel: "Cancel",
    isCancelLeading: true,
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
export const dialogView = ConnectionsBlock.makeView.withInputs<DialogInputs>((model, { workspaceName }, h) =>
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

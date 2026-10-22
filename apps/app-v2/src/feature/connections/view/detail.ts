/** Read, check, and edit one connection. */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { button, buttonRow, field, hint, link, loadingLine, noticeBox, submit } from "@amends-dev/design/control"
import { detailList } from "@amends-dev/design/details"
import { form, settingRow } from "@amends-dev/design/form"
import { pane, paneColumn, paneEmpty, paneForm, paneSection } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { type ConnectionItem, findConnection, integrationOf, isUninstalled } from "../../../data/connections.ts"
import { memberName } from "../../../data/members.ts"
import { calendarDate } from "../../../view/time.ts"
import { ConnectionsBlock } from "../block.ts"
import type { ConnectionsViewBuilder } from "../composition.ts"
import {
  Check,
  checkOf,
  type ConnectionsAction,
  type Edit,
  type Failure,
  findEdit,
  isNameChanged,
  isSettingsChanged,
  mayManage,
  Message,
  type Model,
  nameDraftOf,
  settingsDraftOf
} from "../definition.ts"
import * as SettingsForm from "../settingsForm.ts"
import { healthWording, providesLabel } from "../wording.ts"
import { failureView, isUnread, unreadConnections } from "./feedback.ts"
import { settingsFields } from "./settingsFields.ts"

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
            title: "Its integration isn’t installed on this host",
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
        art: "lost-thread",
        title: "This connection isn’t here",
        copy: "It may have been removed, or you can no longer see it.",
        action: button(h, "Show all connections", Message.ClickedBrowse({ tab: "all" }))
      })
    ]
  })

/**
 * What the page of a connection says before the connections are read, and why they could not be when they could not.
 */
const readingConnection = (model: Model, workspaceName: string, h: ConnectionsViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Connection",
    header: { title: "Connection", icon: "mark-connections", phoneContext: workspaceName },
    body: [isUnread(model) ? unreadConnections(model, h) : loadingLine(h, "Loading connection…")]
  })

/**
 * The page of one connection, the main content: why it can't be used, whether it works, its name, its settings, how
 * it authenticates, and its details. A person who may manage it checks it, renames it, and changes its settings, each
 * saved apart; another reads the same values. A connection the workspace does not list says so, and offers the list;
 * a line says the connections are being read until they are.
 */
export const connectionView = ConnectionsBlock.makeView.withInputs<ConnectionInputs>(
  (model, { connectionId, workspaceName }, h) =>
    Option.match(findConnection(model, connectionId), {
      onNone: () => (model.isLoaded ? missingConnection(workspaceName, h) : readingConnection(model, workspaceName, h)),
      onSome: (item) => connectionPage(item, model, workspaceName, h)
    })
)

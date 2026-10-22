/**
 * The workspace's connections, as a section of the sidebar for each thing a connection gives; as a list page, All and
 * each thing they give on a tab, narrowed by a search, each with its integration and how it authenticates and a mark
 * on its tile when it can't be used; and as the page of one, where, for a person who may manage it, they check
 * whether it works, rename it, change its settings and replace its key, remove it, and see why it can't be used; and
 * adding one, for a person who may, through an integration the host installs. Adding, replacing a key, and removing
 * happen in a dialog the workspace page lends the shell. The workspace page lists the host's integrations once and
 * informs the Block of them. Shared connection records and capability queries live in `data/connections.ts`. The Block reports when the person asks to browse, the connection they pick, and what they did,
 * which the workspace page shows the list or the connection's page for, and confirms.
 */

import { Connection as ConnectionContract, Integration } from "@amends-dev/connection"
import { Grant } from "@amends-dev/core/authorization"
import { Connection, ConnectionPermissions } from "@amends-dev/core/connection"
import { Request } from "@amends-dev/core/request"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import {
  ConnectionItem,
  Integrations,
  integrationsOf,
  integrationOf,
  areIntegrationsListed
} from "../../data/connections.ts"
import { connectionTarget, may, workspaceTarget } from "../../data/permissions.ts"
import { foldAccents } from "../../data/search.ts"
import * as SettingsForm from "./settingsForm.ts"

/** Which connections the list page shows: all of them, or those whose integration gives one thing. */
export const ConnectionsTab = Schema.Union([Schema.Literal("all"), Integration.Capability])
export type ConnectionsTab = typeof ConnectionsTab.Type

/**
 * What the person asks of a connection: adding one, renaming it, changing its settings, replacing its key, checking it,
 * and removing it.
 */
export const ConnectionsAction = Schema.Literals(["Create", "Rename", "Configure", "ReplaceKey", "Check", "Remove"])
export type ConnectionsAction = typeof ConnectionsAction.Type

/**
 * Why a change or a check could not be made, as far as the app can tell: what the person entered does not decode
 * (`Invalid`); this browser or the host could not be reached, or did not confirm (`Failed`); what the person sees is
 * out of date, because they may no longer do this (`Denied`), the connection or workspace is gone (`Gone`), the
 * connection no longer takes a key (`Changed`), or the host no longer installs its integration (`Uninstalled`); the
 * integration refuses the settings or the way of authenticating, saying why (`Refused`); or the host keeps no keys
 * (`StorageUnavailable`).
 */
export const Reason = Schema.Literals([
  "Invalid",
  "Failed",
  "Denied",
  "Gone",
  "Changed",
  "Uninstalled",
  "Refused",
  "StorageUnavailable"
])
export type Reason = typeof Reason.Type

/** A change or a check that could not be made, and why, with what the integration said when it refused. */
export const Failure = Schema.Struct({
  action: ConnectionsAction,
  reason: Reason,
  description: Schema.Option(Schema.String)
})
export type Failure = typeof Failure.Type

/** Checking a connection with its system: under way, done with what it found, or not made, with why. */
export const Check = defineTaggedUnion({
  Checking: {},
  Checked: { health: ConnectionContract.Health },
  Failed: { failure: Failure }
})
export type Check = typeof Check.Type

/** The last check of a connection. */
export const CheckItem = Schema.Struct({ connectionId: ConnectionContract.ConnectionId, check: Check })
export type CheckItem = typeof CheckItem.Type

/**
 * An action of the connections that was written to the store, or could not be: which, with what the update needs to
 * finish it.
 */
export const Written = defineTaggedUnion({
  Rename: { connectionId: ConnectionContract.ConnectionId },
  Configure: { connectionId: ConnectionContract.ConnectionId },
  Remove: { connectionId: ConnectionContract.ConnectionId }
})
export type Written = typeof Written.Type

/**
 * What the person has changed on a connection's page and not saved: the name they typed, the settings they edited,
 * the save on its way, and why the last save or check failed. The page shows the connection as it is saved wherever
 * they changed nothing.
 */
export const Edit = Schema.Struct({
  connectionId: ConnectionContract.ConnectionId,
  name: Schema.Option(Schema.String),
  settings: Schema.Option(SettingsForm.Draft),
  saving: Schema.Option(ConnectionsAction),
  failure: Schema.Option(Failure)
})
export type Edit = typeof Edit.Type

/**
 * A connection being added: the name it was sent under, and, once the host made it, its ID, which the dialog
 * stays on until the store lists the connection.
 */
export const Creating = Schema.Struct({
  name: Schema.String,
  connectionId: Schema.Option(ConnectionContract.ConnectionId)
})
export type Creating = typeof Creating.Type

/**
 * What the dialog that adds a connection shows: the integrations to choose among, narrowed to what the person asked
 * for from a sidebar section and by a search; or the connection to one of them, as the person fills it in. The key
 * of the request is the one an earlier attempt sent, so that a retry of the same values returns the connection the
 * first made and not a second; a change to what is filled in drops it.
 */
export const Adding = defineTaggedUnion({
  Choosing: { capability: Schema.Option(Integration.Capability), query: Schema.String },
  Configuring: {
    capability: Schema.Option(Integration.Capability),
    integrationId: Schema.String,
    name: Schema.String,
    settings: SettingsForm.Draft,
    auth: ConnectionContract.AuthMethod,
    apiKey: Schema.String,
    key: Schema.Option(Request.Key),
    failure: Schema.Option(Failure),
    creating: Schema.Option(Creating)
  }
})
export type Adding = typeof Adding.Type
export type Choosing = Extract<Adding, { readonly _tag: "Choosing" }>
export type Configuring = Extract<Adding, { readonly _tag: "Configuring" }>

/**
 * The dialog that replaces a connection's key: which connection, by the name it had when the person asked, the key
 * they are typing, whether the request is on its way, and why the last one failed.
 */
export const Replacing = Schema.Struct({
  connectionId: ConnectionContract.ConnectionId,
  name: Schema.String,
  apiKey: Schema.String,
  isSending: Schema.Boolean,
  failure: Schema.Option(Failure)
})
export type Replacing = typeof Replacing.Type

/**
 * The confirmation, in the dialog, that removes a connection: which, by the name it had when the person asked,
 * whether it has a key that goes with it, whether the request is on its way, and why the last one failed.
 */
export const Removing = Schema.Struct({
  connectionId: ConnectionContract.ConnectionId,
  name: Schema.String,
  hasKey: Schema.Boolean,
  isSending: Schema.Boolean,
  failure: Schema.Option(Failure)
})
export type Removing = typeof Removing.Type

/**
 * The workspace's connections, whether they are read yet, the members who made them, the integrations the host
 * installs, what the person may do, the list page's tab and search, the dialog and what it is for, adding a
 * connection, replacing a key, or confirming a removal, what they changed on the connections' pages, the last check
 * of each, how many times the person asked to read them again, and why the last read failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  connections: Schema.Array(ConnectionItem),
  isLoaded: Schema.Boolean,
  members: Schema.Array(Member.Member),
  integrations: Integrations,
  grants: Schema.Array(Grant.Grant),
  browse: Schema.Struct({ tab: ConnectionsTab, query: Schema.String }),
  dialog: DialogBlock.Model,
  adding: Schema.Option(Adding),
  replacing: Schema.Option(Replacing),
  removing: Schema.Option(Removing),
  edits: Schema.Array(Edit),
  checks: Schema.Array(CheckItem),
  reads: Schema.Int,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  RequestedDismiss: {},
  ReceivedConnections: { connections: Schema.Array(ConnectionItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String },
  FailedRead: { error: Schema.String },
  ClickedRetry: {},
  ClickedReloadIntegrations: {},
  ClickedRefresh: {},
  ClickedBrowse: { tab: ConnectionsTab },
  ClickedBrowseChannels: {},
  ClickedConnection: { connectionId: ConnectionContract.ConnectionId },
  ClickedAdd: { capability: Schema.Option(Integration.Capability) },
  TypedIntegrationQuery: { query: Schema.String },
  ChoseIntegration: { integrationId: Schema.String },
  ClickedBack: {},
  TypedAddingName: { name: Schema.String },
  ChangedAddingSetting: { name: Schema.String, value: Schema.Union([Schema.String, Schema.Boolean]) },
  ChoseAuth: { auth: ConnectionContract.AuthMethod },
  TypedApiKey: { apiKey: Schema.String },
  SubmittedAdding: {},
  AddedConnection: { connectionId: ConnectionContract.ConnectionId, name: Schema.String },
  FailedAddConnection: { key: Schema.Option(Request.Key), failure: Failure },
  ClickedReplaceKey: { connectionId: ConnectionContract.ConnectionId },
  TypedNewKey: { apiKey: Schema.String },
  SubmittedNewKey: {},
  ReplacedConnectionKey: { connectionId: ConnectionContract.ConnectionId },
  FailedReplaceConnectionKey: { connectionId: ConnectionContract.ConnectionId, failure: Failure },
  ClickedRemove: { connectionId: ConnectionContract.ConnectionId },
  ConfirmedRemoval: {},
  CompletedFocusField: {},
  ChoseBrowseTab: { tab: ConnectionsTab },
  TypedBrowseQuery: { query: Schema.String },
  TypedName: { connectionId: ConnectionContract.ConnectionId, name: Schema.String },
  SubmittedName: { connectionId: ConnectionContract.ConnectionId },
  ChangedSetting: {
    connectionId: ConnectionContract.ConnectionId,
    name: Schema.String,
    value: Schema.Union([Schema.String, Schema.Boolean])
  },
  SubmittedSettings: { connectionId: ConnectionContract.ConnectionId },
  ClickedCheck: { connectionId: ConnectionContract.ConnectionId },
  CheckedConnection: { connectionId: ConnectionContract.ConnectionId, health: ConnectionContract.Health },
  FailedCheckConnection: { connectionId: ConnectionContract.ConnectionId, failure: Failure },
  WroteAction: { written: Written },
  FailedWriteAction: { written: Written, reason: Reason }
})
export type Message = typeof Message.Type

/**
 * What the Block asks of the workspace page: to list the integrations again, once the host could not be reached or
 * the person asks to refresh what they see; to show the connections, which browsing them asks; to open the
 * connection picked; to show the channels; and to confirm to the person what they did, with the page of the
 * connection that was added opening and the list showing once one is removed.
 */
export const OutMessage = defineMessageUnion({
  RequestedIntegrations: {},
  RequestedBrowse: {},
  OpenedConnection: { connectionId: ConnectionContract.ConnectionId },
  RequestedChannels: {},
  SavedName: {},
  SavedSettings: {},
  ReplacedKey: {},
  CreatedConnection: { connectionId: ConnectionContract.ConnectionId, name: Schema.String },
  RemovedConnection: { name: Schema.String }
})
export type OutMessage = typeof OutMessage.Type

export const ConnectionsDefinition = Block.makeDefinition("Connections", { Model, Message, OutMessage })

/** Whether the person may create connections. */
export const mayCreate = (model: Pick<Model, "workspaceId" | "grants">): boolean =>
  may(model.grants, ConnectionPermissions.Create, workspaceTarget(model.workspaceId))

/** Whether the person may add a connection now: they may create connections and the host listed its integrations. */
export const mayAdd = (model: Pick<Model, "workspaceId" | "grants" | "integrations">): boolean =>
  mayCreate(model) && areIntegrationsListed(model)

/** Whether the person may rename the connection, change its settings and key, check it, and remove it. */
export const mayManage = (model: Pick<Model, "workspaceId" | "grants">, { connection }: ConnectionItem): boolean =>
  may(model.grants, ConnectionPermissions.Manage, connectionTarget(model.workspaceId, connection.id))

/**
 * Whether the connection is on the tab: every one is on All, and each is on the tab of each thing its integration
 * gives.
 */
export const isOnTab = (model: Pick<Model, "integrations">, item: ConnectionItem, tab: ConnectionsTab): boolean =>
  tab === "all" || Option.exists(integrationOf(model, item), ({ provides }) => provides.includes(tab))

/** The connections on the tab. */
export const connectionsOnTab = (
  model: Pick<Model, "connections" | "integrations">,
  tab: ConnectionsTab
): ReadonlyArray<ConnectionItem> => model.connections.filter((item) => isOnTab(model, item, tab))

/**
 * The connections the list page shows: those on the tab whose name or integration's name contains the search, in any
 * case and whatever the accents.
 */
export const shownConnections = (
  model: Pick<Model, "connections" | "integrations" | "browse">
): ReadonlyArray<ConnectionItem> => {
  const wanted = foldAccents(model.browse.query.trim())

  return connectionsOnTab(model, model.browse.tab).filter(
    (item) =>
      foldAccents(item.connection.name).includes(wanted) ||
      foldAccents(Option.match(integrationOf(model, item), { onNone: () => "", onSome: ({ name }) => name })).includes(
        wanted
      )
  )
}

/** The connections by name, then by ID among those of one name. */
export const byName = (left: ConnectionItem, right: ConnectionItem): number =>
  left.connection.name.localeCompare(right.connection.name) || (left.connection.id < right.connection.id ? -1 : 1)

/** What changed on the page of `connectionId`, if anything. */
export const findEdit = (model: Pick<Model, "edits">, connectionId: ConnectionContract.ConnectionId) =>
  Option.fromUndefinedOr(model.edits.find((edit) => edit.connectionId === connectionId))

/** The name in the field of the connection's page: what the person typed, or the name it has. */
export const nameDraftOf = (model: Pick<Model, "edits">, { connection }: ConnectionItem): string =>
  Option.getOrElse(
    Option.flatMap(findEdit(model, connection.id), (edit) => edit.name),
    () => connection.name
  )

/** Whether the name the person typed on the connection's page is one to save: not blank, and not the name it has. */
export const isNameChanged = (model: Pick<Model, "edits">, item: ConnectionItem): boolean => {
  const typed = nameDraftOf(model, item).trim()
  return typed !== "" && typed !== item.connection.name
}

/** The settings as the connection saved them, in the fields of its integration's form. */
export const savedSettingsOf = (
  model: Pick<Model, "integrations">,
  item: ConnectionItem
): Option.Option<SettingsForm.Draft> =>
  Option.map(integrationOf(model, item), ({ settings }) => SettingsForm.draftOf(settings, item.connection.settings))

/** The settings in the fields of the connection's page: what the person edited, or the settings it has. */
export const settingsDraftOf = (
  model: Pick<Model, "edits" | "integrations">,
  item: ConnectionItem
): Option.Option<SettingsForm.Draft> =>
  Option.orElse(
    Option.flatMap(findEdit(model, item.connection.id), (edit) => edit.settings),
    () => savedSettingsOf(model, item)
  )

/** Whether the settings the person edited on the connection's page differ from the settings it has. */
export const isSettingsChanged = (model: Pick<Model, "edits" | "integrations">, item: ConnectionItem): boolean =>
  Option.getOrElse(
    Option.zipWith(
      settingsDraftOf(model, item),
      savedSettingsOf(model, item),
      (draft, saved) => !SettingsForm.isSameDraft(draft, saved)
    ),
    () => false
  )

/** The last check of `connectionId`, if the person asked for one. */
export const checkOf = (
  model: Pick<Model, "checks">,
  connectionId: ConnectionContract.ConnectionId
): Option.Option<Check> =>
  Option.fromUndefinedOr(model.checks.find((item) => item.connectionId === connectionId)?.check)

/** The form that adds a connection, while the dialog shows one. */
export const configuringOf = (model: Pick<Model, "adding">): Option.Option<Configuring> =>
  Option.flatMap(model.adding, (adding) =>
    Adding.matchOrElse(adding, { Configuring: (configuring) => Option.some(configuring) }, () => Option.none())
  )

/** The integrations a connection may be added through: those that give `capability`, when the person asked from one. */
export const integrationsToAdd = (
  model: Pick<Model, "integrations">,
  capability: Option.Option<Integration.Capability>
): ReadonlyArray<Connection.IntegrationView> =>
  integrationsOf(model).filter(({ provides }) =>
    Option.match(capability, {
      onNone: () => true,
      onSome: (wanted) => provides.includes(wanted)
    })
  )

/**
 * The integrations the dialog lists: those to add through, whose name or ID contains the search, in any case and
 * whatever the accents.
 */
export const shownIntegrations = (
  model: Pick<Model, "integrations">,
  choosing: Choosing
): ReadonlyArray<Connection.IntegrationView> => {
  const wanted = foldAccents(choosing.query.trim())

  return integrationsToAdd(model, choosing.capability).filter(
    ({ id, name }) => foldAccents(name).includes(wanted) || foldAccents(id).includes(wanted)
  )
}

/**
 * The form that adds a connection through `integration`, which starts as the integration is called, on its defaults and
 * its first way of authenticating.
 */
export const startConfiguring = (
  integration: Connection.IntegrationView,
  capability: Option.Option<Integration.Capability>
): Configuring =>
  Adding.Configuring({
    capability,
    integrationId: integration.id,
    name: integration.name,
    settings: SettingsForm.draftOf(integration.settings),
    auth: integration.auth[0] ?? "none",
    apiKey: "",
    key: Option.none(),
    failure: Option.none(),
    creating: Option.none()
  })

/**
 * The settings a form that adds a connection makes, once it has a name, every setting the integration requires and
 * is whole, and, when it authenticates with a key, the key.
 */
export const settingsToAdd = (
  integration: Connection.IntegrationView,
  configuring: Configuring
): Option.Option<Connection.Settings> =>
  configuring.name.trim() !== "" && (configuring.auth === "none" || configuring.apiKey.trim() !== "")
    ? Result.getSuccess(SettingsForm.settingsOf(integration.settings, configuring.settings))
    : Option.none()

/** Whether a request from the dialog is on its way, so that closing it must wait to show how it ends. */
export const isDialogBusy = (model: Pick<Model, "adding" | "replacing" | "removing">): boolean =>
  Option.exists(configuringOf(model), ({ creating }) =>
    Option.exists(creating, ({ connectionId }) => Option.isNone(connectionId))
  ) ||
  Option.exists(model.replacing, ({ isSending }) => isSending) ||
  Option.exists(model.removing, ({ isSending }) => isSending)

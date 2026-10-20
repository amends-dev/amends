/**
 * The workspace's connections, as a section of the sidebar for each thing a connection gives; as a list page, All and
 * each thing they give on a tab, narrowed by a search, each with its integration and how it authenticates and a mark
 * on its tile when it can't be used; and as the page of one, where, for a person who may manage it, they check
 * whether it works, rename it, and change its settings, and see why it can't be used. The workspace page lists the
 * host's integrations once and informs the Block of them. Other features read here which connections give what they
 * need, by `connectionsGiving`. The Block reports when the person asks to browse and the connection they pick, which
 * the workspace page shows the list or the connection's page for.
 */

import { Connection as ConnectionContract, Integration } from "@amends-dev/connection"
import { Grant } from "@amends-dev/core/authorization"
import { Connection, ConnectionPermissions } from "@amends-dev/core/connection"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { connectionTarget, may, workspaceTarget } from "../../permissions.ts"
import { foldAccents } from "../../seen.ts"
import * as SettingsForm from "../../settingsForm.ts"

/** A connection of the workspace, and whether a change to it is on its way. */
export const ConnectionItem = Schema.Struct({ connection: ReplicaRecord.Connection, pending: Schema.Boolean })
export type ConnectionItem = typeof ConnectionItem.Type

/** The integrations the host installs, as it lists them: loading, loaded, or not reached, with why. */
export const Integrations = defineTaggedUnion({
  Loading: {},
  Loaded: { integrations: Schema.Array(Connection.IntegrationView) },
  Failed: { error: Schema.String }
})
export type Integrations = typeof Integrations.Type

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
  Configure: { connectionId: ConnectionContract.ConnectionId }
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
 * The workspace's connections, whether they are read yet, the members who made them, the integrations the host
 * installs, what the person may do, the list page's tab and search, what they changed on the connections' pages, the
 * last check of each, and why the last read failed.
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
  edits: Schema.Array(Edit),
  checks: Schema.Array(CheckItem),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedConnections: { connections: Schema.Array(ConnectionItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String },
  FailedRead: { error: Schema.String },
  ClickedReloadIntegrations: {},
  ClickedRefresh: {},
  ClickedBrowse: { tab: ConnectionsTab },
  ClickedBrowseChannels: {},
  ClickedConnection: { connectionId: ConnectionContract.ConnectionId },
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
 * connection picked; and to show the channels.
 */
export const OutMessage = defineMessageUnion({
  RequestedIntegrations: {},
  RequestedBrowse: {},
  OpenedConnection: { connectionId: ConnectionContract.ConnectionId },
  RequestedChannels: {}
})
export type OutMessage = typeof OutMessage.Type

export const ConnectionsDefinition = Block.makeDefinition("Connections", { Model, Message, OutMessage })

/** The integrations the host installs, once it listed them. */
export const integrationsOf = ({
  integrations
}: Pick<Model, "integrations">): ReadonlyArray<Connection.IntegrationView> =>
  Integrations.matchOrElse(integrations, { Loaded: (loaded) => loaded.integrations }, () => [])

/** The integration `integrationId`, once the host listed its integrations. */
export const findIntegration = (
  model: Pick<Model, "integrations">,
  integrationId: string
): Option.Option<Connection.IntegrationView> =>
  Option.fromUndefinedOr(integrationsOf(model).find(({ id }) => id === integrationId))

/** The connection `connectionId`, while the workspace has it. */
export const findConnection = (
  model: Pick<Model, "connections">,
  connectionId: ConnectionContract.ConnectionId
): Option.Option<ConnectionItem> =>
  Option.fromUndefinedOr(model.connections.find(({ connection }) => connection.id === connectionId))

/**
 * The connections whose integration gives `capability`, a connection that gives several in each of them. A
 * connection whose integration the host does not install, or does not list yet, gives nothing.
 */
export const connectionItemsGiving = (
  model: Pick<Model, "connections" | "integrations">,
  capability: Integration.Capability
): ReadonlyArray<ConnectionItem> => {
  const integrations = integrationsOf(model)
  return model.connections.filter(({ connection }) =>
    integrations.some(({ id, provides }) => id === connection.integration && provides.includes(capability))
  )
}

/**
 * The connections whose integration gives `capability`, each as its ID and what it is called, for
 * a choice among them. It reads the connections and integrations a Model keeps, so a Block that
 * keeps the same two fields, by `ConnectionItem` and `Integrations`, asks it of its own.
 */
export const connectionsGiving = (
  model: Pick<Model, "connections" | "integrations">,
  capability: Integration.Capability
): ReadonlyArray<readonly [ConnectionContract.ConnectionId, string]> =>
  connectionItemsGiving(model, capability).map(({ connection }) => [connection.id, connection.name] as const)

/** The integration of the connection, once the host listed its integrations and installs it. */
export const integrationOf = (
  model: Pick<Model, "integrations">,
  { connection }: ConnectionItem
): Option.Option<Connection.IntegrationView> => findIntegration(model, connection.integration)

/** Whether the connection's integration is not installed on this host, as the server says. */
export const isUninstalled = ({ connection }: ConnectionItem): boolean =>
  Connection.Readiness.isAnyOf(["Uninstalled"])(connection.readiness)

/** Whether the person may create connections. */
export const mayCreate = (model: Pick<Model, "workspaceId" | "grants">): boolean =>
  may(model.grants, ConnectionPermissions.Create, workspaceTarget(model.workspaceId))

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

/**
 * The workspace's connections, each with its integration and how ready it is, and, for a person who
 * may manage it, renaming it, changing its settings, replacing its key, checking it with its
 * system, and removing it; and adding one to an integration the host installs, for a person who
 * may. The host lists its integrations over HTTP as the Block opens. Other features read here
 * which connections give what they need, by `connectionsGiving`.
 */

import { Connection as ConnectionContract, type Integration } from "@amends-dev/connection"
import { Grant } from "@amends-dev/core/authorization"
import { Connection } from "@amends-dev/core/connection"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
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

/**
 * The form open among the connections: adding one, to an integration, with how it authenticates,
 * its key, and its settings; renaming one; changing one's settings; or replacing one's key. A form
 * sent over HTTP is sending until the host answers, and keeps why it refused.
 */
export const Form = defineTaggedUnion({
  Adding: {
    integrationId: Schema.String,
    name: Schema.String,
    auth: ConnectionContract.AuthMethod,
    apiKey: Schema.String,
    settings: SettingsForm.Draft,
    sending: Schema.Boolean,
    error: Schema.Option(Schema.String)
  },
  Renaming: { connectionId: ConnectionContract.ConnectionId, name: Schema.String },
  Configuring: {
    connectionId: ConnectionContract.ConnectionId,
    settings: SettingsForm.Draft,
    error: Schema.Option(Schema.String)
  },
  ReplacingKey: {
    connectionId: ConnectionContract.ConnectionId,
    apiKey: Schema.String,
    sending: Schema.Boolean,
    error: Schema.Option(Schema.String)
  }
})
export type Form = typeof Form.Type

/** Checking a connection with its system: under way, done with what it found, or not reached, with why. */
export const Check = defineTaggedUnion({
  Checking: {},
  Checked: { health: ConnectionContract.Health },
  Failed: { error: Schema.String }
})
export type Check = typeof Check.Type

/** The last check of a connection. */
export const CheckItem = Schema.Struct({ connectionId: ConnectionContract.ConnectionId, check: Check })
export type CheckItem = typeof CheckItem.Type

/**
 * The workspace's connections, the integrations the host installs, what the person may do, the form
 * open among the connections, the last check of each, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  connections: Schema.Array(ConnectionItem),
  integrations: Integrations,
  grants: Schema.Array(Grant.Grant),
  form: Schema.Option(Form),
  checks: Schema.Array(CheckItem),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedConnections: { connections: Schema.Array(ConnectionItem) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String },
  FailedRead: { error: Schema.String },
  ClickedReloadIntegrations: {},
  ClickedAdd: {},
  ChoseIntegration: { integrationId: Schema.String },
  TypedName: { name: Schema.String },
  ChoseAuth: { auth: ConnectionContract.AuthMethod },
  TypedApiKey: { apiKey: Schema.String },
  ChangedSetting: { name: Schema.String, value: Schema.Union([Schema.String, Schema.Boolean]) },
  SubmittedForm: {},
  ClickedCancelForm: {},
  AddedConnection: {},
  FailedAddConnection: { error: Schema.String },
  ClickedRename: { connectionId: ConnectionContract.ConnectionId },
  ClickedConfigure: { connectionId: ConnectionContract.ConnectionId },
  ClickedReplaceKey: { connectionId: ConnectionContract.ConnectionId },
  ReplacedKey: {},
  FailedReplaceKey: { error: Schema.String },
  ClickedCheck: { connectionId: ConnectionContract.ConnectionId },
  CheckedConnection: { connectionId: ConnectionContract.ConnectionId, health: ConnectionContract.Health },
  FailedCheckConnection: { connectionId: ConnectionContract.ConnectionId, error: Schema.String },
  ClickedRemove: { connectionId: ConnectionContract.ConnectionId },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const ConnectionsDefinition = Block.makeDefinition("Connections", { Model, Message })

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
 * The connections whose integration gives `capability`, each as its ID and what it is called, for
 * a choice among them. It reads the connections and integrations a Model keeps, so a Block that
 * keeps the same two fields, by `ConnectionItem` and `Integrations`, asks it of its own.
 */
export const connectionsGiving = (
  model: Pick<Model, "connections" | "integrations">,
  capability: Integration.Capability
): ReadonlyArray<readonly [ConnectionContract.ConnectionId, string]> => {
  const integrations = integrationsOf(model)
  return model.connections.flatMap(({ connection }) =>
    integrations.some(({ id, provides }) => id === connection.integration && provides.includes(capability))
      ? [[connection.id, connection.name] as const]
      : []
  )
}

/** The last check of `connectionId`, if the person asked for one. */
export const checkOf = (model: Model, connectionId: ConnectionContract.ConnectionId): Option.Option<Check> =>
  Option.fromUndefinedOr(model.checks.find((item) => item.connectionId === connectionId)?.check)

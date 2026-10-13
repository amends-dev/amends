/**
 * A connection is a workspace's link to one integration its host installed, such as its Anthropic
 * account, its Daytona organization, or an MCP server, as `@amends-dev/connection` describes them.
 * Core keeps each connection's record: what the workspace calls it, the settings its integration
 * takes, and how it authenticates. Its key is kept apart from it, so that no secret enters the
 * journal, a fact, or a view. This module holds the record, the inputs of `ConnectionService`'s
 * operations, the views its readers see, and `Access`, what reaches the connection's system.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract, Integration, ModelCatalog } from "@amends-dev/connection"
import * as Schema from "effect/Schema"
import * as Text from "../text/Text.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * Names a connection: `@amends-dev/connection`'s `Connection.ConnectionId`, so that core and an
 * integration name a connection alike.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = ConnectionContract.ConnectionId

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = ConnectionContract.ConnectionId

/**
 * A connection's name as recorded; names chosen now are `NewName`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type

/**
 * A name chosen for a connection: 1 to 80 characters, without hidden ones.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName)

/**
 * A connection's settings by name, as the fields of its integration's settings form give them:
 * text, a number, or yes or no. Never secret.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Settings = Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Settings = typeof Settings.Type

/**
 * Settings given now, whose text has no surrounding spaces and is what storage keeps as given. The
 * connection's integration decides which names it takes.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewSettings = Schema.Record(
  Schema.String,
  Schema.Union([Schema.Trimmed.check(Schema.isMaxLength(2048), Text.isStorable), Schema.Finite, Schema.Boolean])
)

/**
 * The API key a connection authenticates with, redacted so that logs and errors never show it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ApiKey = Schema.Redacted(
  Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(8192), Text.isStorable)
)

/**
 * @category schemas
 * @since 0.1.0
 */
export type ApiKey = typeof ApiKey.Type

/**
 * Whether a connection is in use: `active`, or `removed`. A removed connection's record stays, so
 * that retrying the request that created it finds it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["active", "removed"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type

/**
 * A connection as stored: the integration it links to, what the workspace calls it, its settings,
 * how it authenticates, and whether it is still in use, with who created it and when. Never its
 * key, which `ConnectionCredentialStore` keeps.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Connection = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,

  /** The integration the connection links to, as its id names it, such as `anthropic`. */
  integration: Schema.NonEmptyString,
  name: Name,
  settings: Settings,

  /** How the connection authenticates; one that authenticates with a key always has one. */
  auth: ConnectionContract.AuthMethod,
  status: Status,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Connection extends Schema.Schema.Type<typeof Connection> {}

/**
 * The record with the given fields replaced: what a rename, a configuration, or a removal makes of
 * it.
 *
 * @category utils
 * @since 0.1.0
 */
export const change = (record: Connection, changes: Partial<Connection>): Connection =>
  Object.assign({}, record, changes)

/**
 * A new connection, with its key when it authenticates with one, and only then. The key is stored
 * apart from the connection, in the same commit.
 *
 * @category options
 * @since 0.1.0
 */
export const CreateInput = Schema.Struct({
  integration: Schema.NonEmptyString,
  name: NewName,
  settings: NewSettings,
  auth: ConnectionContract.AuthMethod,
  apiKey: Schema.optionalKey(ApiKey)
}).check(
  Schema.makeFilter(
    (input) =>
      (input.auth === "apiKey") === (input.apiKey !== undefined) ||
      "Expected an API key exactly when the connection authenticates with one"
  )
)

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/**
 * A new name, with the name it replaces, so that a rename made meanwhile is not overwritten.
 *
 * @category options
 * @since 0.1.0
 */
export const RenameInput = Schema.Struct({ connectionId: Id, name: NewName, expectedName: Name })

/**
 * @category options
 * @since 0.1.0
 */
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/**
 * A connection's settings, replaced as a whole.
 *
 * @category options
 * @since 0.1.0
 */
export const ConfigureInput = Schema.Struct({ connectionId: Id, settings: NewSettings })

/**
 * @category options
 * @since 0.1.0
 */
export interface ConfigureInput extends Schema.Schema.Type<typeof ConfigureInput> {}

/**
 * A new key for a connection that authenticates with one, in place of its key.
 *
 * @category options
 * @since 0.1.0
 */
export const ReplaceKeyInput = Schema.Struct({ connectionId: Id, apiKey: ApiKey })

/**
 * @category options
 * @since 0.1.0
 */
export interface ReplaceKeyInput extends Schema.Schema.Type<typeof ReplaceKeyInput> {}

/**
 * What renaming records: the connection and its new name, the payload of
 * `ConnectionFacts.Renamed`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Renamed = Schema.Struct({ workspaceId: WorkspaceId.Id, connectionId: Id, name: Name })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}

/**
 * What reconfiguring records: the connection and its settings, replaced as a whole, the payload of
 * `ConnectionFacts.Configured`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Configured = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  connectionId: Id,
  settings: Settings
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Configured extends Schema.Schema.Type<typeof Configured> {}

/**
 * A connection, as a fact that records no more of it names it: its key replaced, or removed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.Struct({ workspaceId: WorkspaceId.Id, connectionId: Id })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Reference extends Schema.Schema.Type<typeof Reference> {}

/**
 * Whether a connection can be used as it is: `Invalid` when its integration no longer takes its
 * settings or how it authenticates, as after the host changed the integration, and `Uninstalled`
 * when the host no longer installs its integration. Being ready says nothing of whether the system
 * accepts its key, which only checking the connection asks.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Readiness = Schema.TaggedUnion({
  Ready: {},
  Invalid: { description: Schema.String },
  Uninstalled: {}
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Readiness = typeof Readiness.Type

/**
 * A connection as its readers see it, as `ConnectionService` returns it: the record without its
 * status, with its readiness and whether the reader may manage it. Never its key.
 *
 * @category schemas
 * @since 0.1.0
 */
export const View = Schema.Struct({
  id: Id,
  name: Name,
  integration: Schema.NonEmptyString,
  settings: Settings,
  auth: ConnectionContract.AuthMethod,
  readiness: Readiness,

  /** Whether the reader may rename it, change its settings and key, check it, and remove it. */
  manageable: Schema.Boolean,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface View extends Schema.Schema.Type<typeof View> {}

/**
 * A connection as its integration takes it, with its key when it authenticates with one: what
 * whoever reaches the connection's system, such as a turn's job or a channel's, is given.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Access = Schema.Struct({
  connection: ConnectionContract.Connection,
  credential: Schema.NullOr(ConnectionContract.Credential)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Access extends Schema.Schema.Type<typeof Access> {}

/**
 * The record as its integration takes it, `@amends-dev/connection`'s `Connection.Connection`:
 * without its workspace, its status, or who created it.
 *
 * @category utils
 * @since 0.1.0
 */
export const connectionOf = (record: Connection): ConnectionContract.Connection => ({
  id: record.id,
  integration: record.integration,
  name: record.name,
  settings: record.settings,
  auth: record.auth
})

/**
 * A connection as its readers see it, as ready as its integration finds it.
 *
 * @category utils
 * @since 0.1.0
 */
export const view = (record: Connection, readiness: Readiness, manageable: boolean): View => ({
  id: record.id,
  name: record.name,
  integration: record.integration,
  settings: record.settings,
  auth: record.auth,
  readiness,
  manageable,
  createdBy: record.createdBy,
  createdAt: record.createdAt
})

/**
 * An integration its host installs, as readers see it when they connect to it: what it is, how a
 * connection authenticates, what it gives, and the form of its settings. Every member may see it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const IntegrationView = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,

  /** Where the system's documentation is, as for how to get a key. */
  docs: Schema.optionalKey(Schema.String),

  /** How a connection can authenticate, in the order to offer them. */
  auth: Schema.NonEmptyArray(ConnectionContract.AuthMethod),
  provides: Schema.Array(Integration.Capability),

  /** Whether the agent of the harnesses a connection gives works only in a sandbox. */
  requiresSandbox: Schema.Boolean,
  settings: Integration.SettingsForm
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface IntegrationView extends Schema.Schema.Type<typeof IntegrationView> {}

/**
 * An installed integration as readers see it, as `ConnectionService.integrations` lists it.
 *
 * @category utils
 * @since 0.1.0
 */
export const integrationView = (integration: Integration.Integration): IntegrationView => ({
  id: integration.id,
  name: integration.name,
  ...(integration.docs === undefined ? {} : { docs: integration.docs }),
  auth: integration.auth,
  provides: integration.provides,
  requiresSandbox: integration.requiresSandbox,
  settings: integration.settings
})

/**
 * The models a connection offers an agent: the catalog's models its integration lists, and whether
 * it also offers models it does not list, by any id, as an API of the connection's own does. A
 * connection whose integration gives no models offers none.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Models = Schema.Struct({
  listed: Schema.Array(ModelCatalog.Model),
  unlisted: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Models extends Schema.Schema.Type<typeof Models> {}

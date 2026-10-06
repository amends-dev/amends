/**
 * A connection is a workspace's link to one integration its host installed, such as its Anthropic
 * account, its Daytona organization, or an MCP server, as `@amends/connection-v2` describes them.
 * Core keeps each connection's record: what the workspace calls it, the settings its integration
 * takes, and how it authenticates. Its key is kept apart from it, so that no secret enters the
 * journal, a fact, or a view.
 *
 * This feature is built beside `connection/`, which it is to replace, and shares nothing with it.
 */
import { Connection, Integration } from "@amends/connection-v2";
import { Schema } from "effect";
import { Text } from "../text/text.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";

export const Id = Connection.ConnectionId;
export type Id = Connection.ConnectionId;

/** A connection's name as recorded; names chosen now are `NewName`. */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;
/** A name chosen for a connection: 1 to 80 characters, without hidden ones. */
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName);

/**
 * A connection's settings by name, as the fields of its integration's settings form give them:
 * text, a number, or yes or no. Never secret.
 */
export const Settings = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]),
);
export type Settings = typeof Settings.Type;
/**
 * Settings given now, whose text has no surrounding spaces and is what storage keeps as given. The
 * connection's integration decides which names it takes.
 */
export const NewSettings = Schema.Record(
  Schema.String,
  Schema.Union([
    Schema.Trimmed.check(Schema.isMaxLength(2048), Text.isStorable),
    Schema.Finite,
    Schema.Boolean,
  ]),
);

/** The API key a connection authenticates with, redacted so that logs and errors never show it. */
export const ApiKey = Schema.Redacted(
  Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(8192), Text.isStorable),
);
export type ApiKey = typeof ApiKey.Type;

/** A removed connection's record stays, so that retrying the request that created it finds it. */
export const Status = Schema.Literals(["active", "removed"]);
export type Status = typeof Status.Type;

export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,

  /** The integration the connection links to, as its id names it, such as `anthropic`. */
  integration: Schema.NonEmptyString,
  name: Name,
  settings: Settings,

  /** How the connection authenticates; one that authenticates with a key always has one. */
  auth: Connection.AuthMethod,
  status: Status,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The record with some fields changed. */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/**
 * A new connection, with its key when it authenticates with one, and only then. The key is stored
 * apart from the connection, in the same commit.
 */
export const CreateInput = Schema.Struct({
  integration: Schema.NonEmptyString,
  name: NewName,
  settings: NewSettings,
  auth: Connection.AuthMethod,
  apiKey: Schema.optionalKey(ApiKey),
}).check(
  Schema.makeFilter(
    (input) =>
      (input.auth === "apiKey") === (input.apiKey !== undefined) ||
      "Expected an API key exactly when the connection authenticates with one",
  ),
);
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/** A new name, with the name it replaces, so that a rename made meanwhile is not overwritten. */
export const RenameInput = Schema.Struct({ connectionId: Id, name: NewName, expectedName: Name });
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/** A connection's settings, replaced as a whole. */
export const ConfigureInput = Schema.Struct({ connectionId: Id, settings: NewSettings });
export interface ConfigureInput extends Schema.Schema.Type<typeof ConfigureInput> {}

/** A new key for a connection that authenticates with one, in place of its key. */
export const ReplaceKeyInput = Schema.Struct({ connectionId: Id, apiKey: ApiKey });
export interface ReplaceKeyInput extends Schema.Schema.Type<typeof ReplaceKeyInput> {}

/** What renaming records. */
export const Renamed = Schema.Struct({ workspaceId: WorkspaceId.Id, connectionId: Id, name: Name });
export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}
/** What reconfiguring records. */
export const Configured = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  connectionId: Id,
  settings: Settings,
});
export interface Configured extends Schema.Schema.Type<typeof Configured> {}
/** What replacing a connection's key or removing a connection records. */
export const Change = Schema.Struct({ workspaceId: WorkspaceId.Id, connectionId: Id });
export interface Change extends Schema.Schema.Type<typeof Change> {}

/**
 * Whether a connection can be used as it is: `Invalid` when its integration no longer takes its
 * settings or how it authenticates, as after the host changed the integration, and `Uninstalled`
 * when the host no longer installs its integration. Being ready says nothing of whether the system
 * accepts its key, which only checking the connection asks.
 */
export const Readiness = Schema.TaggedUnion({
  Ready: {},
  Invalid: { description: Schema.String },
  Uninstalled: {},
});
export type Readiness = typeof Readiness.Type;

/** A connection as its readers see it: never its key. */
export const View = Schema.Struct({
  id: Id,
  name: Name,
  integration: Schema.NonEmptyString,
  settings: Settings,
  auth: Connection.AuthMethod,
  readiness: Readiness,

  /** Whether the reader may rename it, change its settings and key, check it, and remove it. */
  manageable: Schema.Boolean,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface View extends Schema.Schema.Type<typeof View> {}

/** A connection as its readers see it, as ready as its integration finds it. */
export const view = (record: Record, readiness: Readiness, manageable: boolean): View => ({
  id: record.id,
  name: record.name,
  integration: record.integration,
  settings: record.settings,
  auth: record.auth,
  readiness,
  manageable,
  createdBy: record.createdBy,
  createdAt: record.createdAt,
});

/**
 * An integration its host installs, as readers see it when they connect to it: what it is, how a
 * connection authenticates, what it gives, and the form of its settings. Every member may see it.
 */
export const IntegrationView = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,

  /** Where the system's documentation is, as for how to get a key. */
  docs: Schema.optionalKey(Schema.String),

  /** How a connection can authenticate, in the order to offer them. */
  auth: Schema.NonEmptyArray(Connection.AuthMethod),
  provides: Schema.Array(Integration.Capability),
  settings: Integration.SettingsForm,
});
export interface IntegrationView extends Schema.Schema.Type<typeof IntegrationView> {}

/** An integration as readers see it. */
export const integrationView = (integration: Integration.Integration): IntegrationView => ({
  id: integration.id,
  name: integration.name,
  ...(integration.docs === undefined ? {} : { docs: integration.docs }),
  auth: integration.auth,
  provides: integration.provides,
  settings: integration.settings,
});

export * as ConnectionV2 from "./connection.ts";

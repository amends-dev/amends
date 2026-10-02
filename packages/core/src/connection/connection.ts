import { ConnectionImplementation } from "@amends/connection";
import { Schema } from "effect";
import { Text } from "../text/text.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { ConnectionId } from "./id.ts";

export const Id = ConnectionId.Id;
export type Id = ConnectionId.Id;

/** Identifies one stored credential; replacing a credential stores another. */
export const CredentialId = Schema.NonEmptyString.pipe(Schema.brand("ConnectionCredentialId"));
export type CredentialId = typeof CredentialId.Type;

export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName);

/** A connection's settings by key, as its implementation declares them. Never secret. */
export const Settings = Schema.Record(Schema.NonEmptyString, Schema.String);
export type Settings = typeof Settings.Type;
export const NewSettings = Schema.Record(
  Schema.NonEmptyString,
  Schema.Trimmed.check(Schema.isMaxLength(2048), Text.isStorable),
);

/** How a connection authenticates, and a reference to its credential once one is set. */
export const Authentication = Schema.TaggedUnion({
  None: {},
  ApiKey: { credentialId: Schema.NullOr(CredentialId) },
});
export type Authentication = typeof Authentication.Type;
export const Method = Schema.Literals(["None", "ApiKey"]);
export type Method = typeof Method.Type;

export const Status = Schema.Literals(["active", "removed"]);
export type Status = typeof Status.Type;

/**
 * Workspace-owned access to an external system through a registered implementation: its settings
 * and how it authenticates. The credential itself is in protected storage, referenced here.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  name: Name,
  implementationId: ConnectionImplementation.Id,
  settings: Settings,
  authentication: Authentication,
  status: Status,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The record with some fields changed. */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/** Secret material, such as an API key, kept redacted so logs and errors never show it. */
export const Secret = Schema.Redacted(Schema.NonEmptyString.check(Schema.isMaxLength(8192)));
export type Secret = typeof Secret.Type;

/** A new connection, which takes its credential separately so no secret reaches the journal. */
export const CreateInput = Schema.Struct({
  name: NewName,
  implementationId: ConnectionImplementation.Id,
  settings: NewSettings,
  authentication: Method,
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const RenameInput = Schema.Struct({ connectionId: Id, name: NewName, expectedName: Name });
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/** A connection's settings, replaced as a whole. */
export const ConfigureInput = Schema.Struct({ connectionId: Id, settings: NewSettings });
export interface ConfigureInput extends Schema.Schema.Type<typeof ConfigureInput> {}

export const SetCredentialInput = Schema.Struct({ connectionId: Id, secret: Secret });
export interface SetCredentialInput extends Schema.Schema.Type<typeof SetCredentialInput> {}

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
/** What setting a credential records: the reference, never the secret. */
export const CredentialSet = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  connectionId: Id,
  credentialId: CredentialId,
});
export interface CredentialSet extends Schema.Schema.Type<typeof CredentialSet> {}
/** What clearing a credential or removing a connection records. */
export const Change = Schema.Struct({ workspaceId: WorkspaceId.Id, connectionId: Id });
export interface Change extends Schema.Schema.Type<typeof Change> {}

/**
 * Whether a connection has what one capability needs, or what it lacks: required settings by
 * key, and whether its credential is missing. Readiness never removes a capability the
 * implementation declares.
 */
export const Readiness = Schema.TaggedUnion({
  Ready: {},
  Incomplete: { settings: Schema.Array(Schema.String), credential: Schema.Boolean },
});
export type Readiness = typeof Readiness.Type;

/** A connection as its readers see it: never its credential, only whether one is set. */
export const View = Schema.Struct({
  id: Id,
  name: Name,
  implementationId: ConnectionImplementation.Id,
  settings: Settings,
  authentication: Schema.TaggedUnion({ None: {}, ApiKey: { configured: Schema.Boolean } }),
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
  /**
   * Whether this host has installed the implementation. Without it, the connection declares no
   * capabilities here and cannot be used, though its record remains.
   */
  installed: Schema.Boolean,
  capabilities: ConnectionImplementation.Capabilities,
  /** Whether the reader may rename, configure, set or clear the credential of, and remove it. */
  manageable: Schema.Boolean,
  /** Readiness for each capability the implementation declares. */
  readiness: Schema.Struct({
    modelInference: Schema.optionalKey(Readiness),
    sandbox: Schema.optionalKey(Readiness),
  }),
});
export interface View extends Schema.Schema.Type<typeof View> {}

const isUrl = /^https?:\/\/[^\s/?#]+[^\s]*$/;
const isWholeNumber = /^[1-9]\d{0,14}$/;

/**
 * The problems with settings for an implementation: keys it does not declare, required values
 * missing, and values that are not what their kind asks for.
 */
export const settingIssues = (
  declaration: ConnectionImplementation.Declaration,
  settings: Settings,
): ReadonlyArray<string> => {
  const declared = new Map(declaration.settings.map((setting) => [setting.key, setting]));
  const issues: Array<string> = [];
  for (const key of Object.keys(settings))
    if (!declared.has(key)) issues.push(`${key} is not a setting of ${declaration.name}.`);
  for (const setting of declaration.settings) {
    const value = settings[setting.key];
    if (value === undefined || value === "") {
      if (setting.required) issues.push(`${setting.label} is required.`);
    } else if (setting.kind === "url" && !isUrl.test(value))
      issues.push(`${setting.label} must be an http or https URL.`);
    else if (setting.kind === "integer" && !isWholeNumber.test(value))
      issues.push(`${setting.label} must be a whole number above zero.`);
  }
  return issues;
};

/** Required settings a connection lacks, by key. */
const missingSettings = (
  declaration: ConnectionImplementation.Declaration,
  settings: Settings,
): ReadonlyArray<string> =>
  declaration.settings.flatMap((setting) =>
    setting.required && (settings[setting.key] ?? "") === "" ? [setting.key] : [],
  );

/**
 * Readiness for one capability, from what the connection has. Every capability needs the same
 * settings and credential today; per-capability requirements, such as OAuth scopes, will differ.
 */
export const readiness = (
  record: Record,
  declaration: ConnectionImplementation.Declaration,
): Readiness => {
  const settings = missingSettings(declaration, record.settings);
  const credential =
    Authentication.isAnyOf(["ApiKey"])(record.authentication) &&
    record.authentication.credentialId === null;
  return settings.length === 0 && !credential
    ? { _tag: "Ready" }
    : { _tag: "Incomplete", settings, credential };
};

/** A connection as its readers see it, with readiness for what this host's catalog declares. */
export const view = (
  record: Record,
  declaration: ConnectionImplementation.Declaration | undefined,
  manageable: boolean,
): View => ({
  id: record.id,
  name: record.name,
  implementationId: record.implementationId,
  settings: record.settings,
  authentication: Authentication.isAnyOf(["ApiKey"])(record.authentication)
    ? { _tag: "ApiKey", configured: record.authentication.credentialId !== null }
    : { _tag: "None" },
  createdBy: record.createdBy,
  createdAt: record.createdAt,
  installed: declaration !== undefined,
  capabilities: declaration?.capabilities ?? {},
  manageable,
  readiness:
    declaration === undefined
      ? {}
      : {
          ...(declaration.capabilities.modelInference === undefined
            ? {}
            : { modelInference: readiness(record, declaration) }),
          ...(declaration.capabilities.sandbox === undefined
            ? {}
            : { sandbox: readiness(record, declaration) }),
        },
});

export * as Connection from "./connection.ts";

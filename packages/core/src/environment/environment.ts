import { Harness, HarnessImplementation } from "@amends/harness";
import { SandboxImplementation } from "@amends/sandbox";
import { Schema } from "effect";
import { ConnectionId } from "../connection/id.ts";
import { Text } from "../text/text.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { EnvironmentId } from "./id.ts";

export const Id = EnvironmentId.Id;
export type Id = EnvironmentId.Id;

/**
 * The environment every workspace starts with: amends's own harness in process, without a
 * sandbox. It is an ordinary environment once created, so it can be renamed or removed.
 */
export const InProcessId = Id.make("in-process");
export const inProcessName = "In-process";
export const inProcessHarness = Harness.Name.make("amends");

export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName);

/**
 * What releasing a running environment does with its sandbox: stop it, keeping its files so the
 * next turn can acquire it again, or destroy it. Provisional: the two the sandbox contract offers.
 */
export const Retention = Schema.Literals(["stop", "destroy"]);
export type Retention = typeof Retention.Type;

/** Environment variables every command in a new sandbox receives. Never secret. */
export const Env = Schema.Record(Schema.NonEmptyString, Schema.String);
export type Env = typeof Env.Type;
const NewEnv = Schema.Record(
  Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/)),
  Schema.String.check(Schema.isMaxLength(4096), Text.isStorable),
).check(
  Schema.makeFilter(
    (env: { readonly [key: string]: string }) =>
      Object.keys(env).length <= 50 || "Expected at most 50 variables",
  ),
);

/** A shell command a new or reacquired sandbox runs before the harness starts. */
const SetupStep = Schema.Trimmed.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(4096),
  Text.isStorable,
);

/**
 * A sandbox as an environment configures it: the provider, where the harness runs, the account it
 * runs under, the starting point for new sandboxes, their variables, the setup that prepares them
 * in order, and what releasing one does.
 */
export const Sandbox = Schema.Struct({
  providerId: SandboxImplementation.Id,
  harness: HarnessImplementation.Placement,
  connectionId: Schema.NullOr(ConnectionId.Id),
  template: Schema.NullOr(Schema.String),
  env: Env,
  setup: Schema.Array(Schema.String),
  retention: Retention,
});
export interface Sandbox extends Schema.Schema.Type<typeof Sandbox> {}

/** The sandbox settings that can change after creation; the provider and placement cannot. */
export const SandboxSettings = Schema.Struct({
  connectionId: Schema.NullOr(ConnectionId.Id),
  template: Schema.NullOr(
    Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(512), Text.isStorable),
  ),
  env: NewEnv,
  setup: Schema.Array(SetupStep).check(Schema.isMaxLength(50)),
  retention: Retention,
});
export interface SandboxSettings extends Schema.Schema.Type<typeof SandboxSettings> {}

export const NewSandbox = Schema.Struct({
  providerId: SandboxImplementation.Id,
  harness: HarnessImplementation.Placement,
  ...SandboxSettings.fields,
});
export interface NewSandbox extends Schema.Schema.Type<typeof NewSandbox> {}

export const Status = Schema.Literals(["active", "removed"]);
export type Status = typeof Status.Type;

/**
 * Where and how agents run: a harness, and optionally the sandbox it works in. Model access,
 * instructions, and toolkits belong to agents; credentials to connections.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  name: Name,
  harnessId: Harness.Name,
  sandbox: Schema.NullOr(Sandbox),
  status: Status,
  /** Null for the environment the workspace started with. */
  createdBy: Schema.NullOr(MemberId.Id),
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The record with some fields changed. */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

export const CreateInput = Schema.Struct({
  name: NewName,
  harnessId: Harness.Name,
  sandbox: Schema.NullOr(NewSandbox),
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const RenameInput = Schema.Struct({ environmentId: Id, name: NewName, expectedName: Name });
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/** An environment's sandbox settings, replaced as a whole. */
export const ConfigureInput = Schema.Struct({ environmentId: Id, sandbox: SandboxSettings });
export interface ConfigureInput extends Schema.Schema.Type<typeof ConfigureInput> {}

/** What renaming records. */
export const Renamed = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  environmentId: Id,
  name: Name,
});
export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}
/** What reconfiguring records. */
export const Configured = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  environmentId: Id,
  sandbox: Sandbox,
});
export interface Configured extends Schema.Schema.Type<typeof Configured> {}
/** What removing records. */
export const Change = Schema.Struct({ workspaceId: WorkspaceId.Id, environmentId: Id });
export interface Change extends Schema.Schema.Type<typeof Change> {}

/**
 * What stops an environment from running now: this host no longer installs its harness or sandbox
 * provider, its account connection is gone or not one this provider takes, or that connection
 * still needs setup.
 */
export const Issue = Schema.Literals([
  "harness-unavailable",
  "sandbox-unavailable",
  "connection-unavailable",
  "connection-incomplete",
]);
export type Issue = typeof Issue.Type;

export const Readiness = Schema.TaggedUnion({
  Ready: {},
  Incomplete: { issues: Schema.NonEmptyArray(Issue) },
});
export type Readiness = typeof Readiness.Type;

/** An environment as its readers see it. */
export const View = Schema.Struct({
  id: Id,
  name: Name,
  harnessId: Harness.Name,
  sandbox: Schema.NullOr(Sandbox),
  createdBy: Schema.NullOr(MemberId.Id),
  createdAt: Schema.DateTimeUtcFromString,
  /** Whether the reader may rename, configure, and remove it. */
  manageable: Schema.Boolean,
  readiness: Readiness,
});
export interface View extends Schema.Schema.Type<typeof View> {}

/** An environment as its readers see it, with its readiness. */
export const view = (record: Record, manageable: boolean, readiness: Readiness): View => ({
  id: record.id,
  name: record.name,
  harnessId: record.harnessId,
  sandbox: record.sandbox,
  createdBy: record.createdBy,
  createdAt: record.createdAt,
  manageable,
  readiness,
});

/** The in-process environment, as a workspace starts with it. */
export const inProcess = (workspaceId: WorkspaceId.Id, createdAt: Record["createdAt"]): Record => ({
  id: InProcessId,
  workspaceId,
  name: inProcessName,
  harnessId: inProcessHarness,
  sandbox: null,
  status: "active",
  createdBy: null,
  createdAt,
});

export * as Environment from "./environment.ts";

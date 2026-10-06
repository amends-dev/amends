/**
 * An agent is a workspace member that works, as its instructions say, on a harness and a model, and
 * in a sandbox when it needs one, each given by one of the workspace's connections, as
 * `@amends/core/connection-v2` keeps them. Its name, its role, and whether it is still in the
 * workspace are its membership's, which it joins with as any member does.
 *
 * This feature is built beside `agent/`, which it is to replace, and shares nothing with it.
 */
import { ModelEndpoint } from "@amends/harness-v2";
import { Schema } from "effect";
import { Role } from "../authorization/role/role.ts";
import { ConnectionV2 } from "../connection-v2/connection.ts";
import { Identity } from "../identity/identity.ts";
import { Text } from "../text/text.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { Member } from "../workspace/member/member.ts";

/** An agent's identity, which its membership refers to. */
export const Id = Identity.AgentId;
export type Id = Identity.AgentId;

/** What an agent works by, its system prompt: up to 20,000 characters. */
export const Instructions = Schema.String.check(Schema.isMaxLength(20_000));
export type Instructions = typeof Instructions.Type;
/** Instructions given now, without surrounding space, which storage keeps as given. */
export const NewInstructions = Schema.Trimmed.check(Schema.isMaxLength(20_000), Text.isStorable);

// TODO: Choose the harness of an agent on `Auto` for each of its turns, once agents v2 run turns.
/**
 * The harness an agent runs on: that of one of the workspace's connections that gives harnesses,
 * or `Auto`, for amends to choose among them as the agent works.
 */
export const Harness = Schema.TaggedUnion({
  Auto: {},
  Connection: { connectionId: ConnectionV2.Id },
});
export type Harness = typeof Harness.Type;

// TODO: Add the models a turn can name besides an agent's model, and the most an answer may write,
// once a turn names a model or a person sets a limit.
/**
 * The model an agent runs on: one that a connection offers, by the id its provider gives it, and how
 * hard it reasons, which is the model's default when absent.
 */
export const Model = Schema.Struct({
  connectionId: ConnectionV2.Id,
  id: Schema.NonEmptyString,
  effort: Schema.optionalKey(ModelEndpoint.Effort),
});
export interface Model extends Schema.Schema.Type<typeof Model> {}
/** A model chosen now, whose id has no surrounding space. */
export const NewModel = Schema.Struct({
  ...Model.fields,
  id: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(200), Text.isStorable),
});

// TODO: Add how an agent's sandboxes are prepared, such as the image they start from and the
// commands that set them up, and the network they reach, once an agent's work needs them.
/** Where an agent works: the sandboxes of one of the workspace's connections that gives them. */
export const Sandbox = Schema.Struct({ connectionId: ConnectionV2.Id });
export interface Sandbox extends Schema.Schema.Type<typeof Sandbox> {}

export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,

  /** The agent's membership, which names it and gives it its role. */
  memberId: MemberId.Id,
  instructions: Instructions,
  harness: Harness,
  model: Model,

  /** Where it works, or nowhere, for an agent that answers from its model alone. */
  sandbox: Schema.NullOr(Sandbox),
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The record with some fields changed. */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/** How an agent is set up, which configuring replaces as a whole. */
export const Configuration = Schema.Struct({
  instructions: NewInstructions,
  harness: Harness,
  model: NewModel,
  sandbox: Schema.NullOr(Sandbox),
});
export interface Configuration extends Schema.Schema.Type<typeof Configuration> {}

/** A new agent: its name and the role it starts with, as its membership's, and how it is set up. */
export const CreateInput = Schema.Struct({
  name: Member.NewName,
  roleId: Role.Id,
  ...Configuration.fields,
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const ConfigureInput = Schema.Struct({ agentId: Id, ...Configuration.fields });
export interface ConfigureInput extends Schema.Schema.Type<typeof ConfigureInput> {}

/** A new name, with the name it replaces, so that a rename made meanwhile is not overwritten. */
export const RenameInput = Schema.Struct({
  agentId: Id,
  name: Member.NewName,
  expectedName: Member.Name,
});
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/** What configuring records. */
export const Configured = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  agentId: Id,
  memberId: MemberId.Id,
  instructions: Instructions,
  harness: Harness,
  model: Model,
  sandbox: Schema.NullOr(Sandbox),
});
export interface Configured extends Schema.Schema.Type<typeof Configured> {}

/** The part of an agent's setup that a connection gives. */
export const Part = Schema.Literals(["harness", "model", "sandbox"]);
export type Part = typeof Part.Type;

/**
 * Why an agent cannot run as it is set up: the connection for one of its parts was removed, its
 * integration is no longer installed, or it no longer gives that part as the agent takes it, as
 * when its integration no longer offers the agent's model, which the integration describes; its
 * harness's agent works only in a sandbox and it has none; or, on `Auto`, no connection gives a
 * harness it can run on.
 */
export const Issue = Schema.TaggedUnion({
  Removed: { part: Part },
  Uninstalled: { part: Part },
  Invalid: { part: Part, description: Schema.String },
  SandboxRequired: {},
  NoHarness: {},
});
export type Issue = typeof Issue.Type;

/** Whether an agent can run as it is set up now, whoever reads it. */
export const Readiness = Schema.TaggedUnion({
  Ready: {},
  Incomplete: { issues: Schema.NonEmptyArray(Issue) },
});
export type Readiness = typeof Readiness.Type;

/**
 * An agent as its readers see it. Its role and its removal are its membership's, which members'
 * operations read and change.
 */
export const View = Schema.Struct({
  id: Id,
  memberId: MemberId.Id,

  /** Its membership's name. */
  name: Member.Name,
  instructions: Instructions,
  harness: Harness,
  model: Model,
  sandbox: Schema.NullOr(Sandbox),
  readiness: Readiness,

  /** Whether the reader may rename it and change how it is set up. */
  configurable: Schema.Boolean,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface View extends Schema.Schema.Type<typeof View> {}

/** An agent named `name`, as ready as `readiness` says, as a reader sees it. */
export const view = (
  record: Record,
  name: Member.Name,
  readiness: Readiness,
  configurable: boolean,
): View => ({
  id: record.id,
  memberId: record.memberId,
  name,
  instructions: record.instructions,
  harness: record.harness,
  model: record.model,
  sandbox: record.sandbox,
  readiness,
  configurable,
  createdBy: record.createdBy,
  createdAt: record.createdAt,
});

export * as AgentV2 from "./agent.ts";

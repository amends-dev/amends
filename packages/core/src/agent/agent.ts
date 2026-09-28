import { Schema } from "effect";
import { ConnectionId } from "../connection/id.ts";
import { EnvironmentCompatibility } from "../environment/compatibility.ts";
import { EnvironmentId } from "../environment/id.ts";
import { Identity } from "../identity/identity.ts";
import { Role } from "../authorization/role/role.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { Member } from "../workspace/member/member.ts";

/** An agent's identity, which its workspace membership refers to. */
export const Id = Identity.AgentId;
export type Id = Identity.AgentId;

/** Instructions an agent works by: its system prompt. */
export const Instructions = Schema.String.check(Schema.isMaxLength(20_000));
const NewInstructions = Schema.Trimmed.check(Schema.isMaxLength(20_000));

/**
 * The model access an agent asks for: a workspace connection with model inference, the
 * provider's model identifier, and a reasoning level, if any.
 */
export const ModelSelection = Schema.Struct({
  connectionId: ConnectionId.Id,
  model: Schema.NonEmptyString,
  reasoning: Schema.NullOr(Schema.NonEmptyString),
});
export interface ModelSelection extends Schema.Schema.Type<typeof ModelSelection> {}
const NewModelSelection = Schema.Struct({
  connectionId: ConnectionId.Id,
  model: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  reasoning: Schema.NullOr(Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(50))),
});

/**
 * An agent's behavioral configuration: its instructions, model access, and the environment it
 * starts in. Its name, status, and access belong to its workspace membership, `memberId`; its
 * credentials to its connection.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  memberId: MemberId.Id,
  instructions: Instructions,
  model: ModelSelection,
  environmentId: EnvironmentId.Id,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The record with some fields changed. */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/** What configuring replaces: the agent's instructions, model access, and starting environment. */
export const Configuration = Schema.Struct({
  instructions: NewInstructions,
  model: NewModelSelection,
  environmentId: EnvironmentId.Id,
});
export interface Configuration extends Schema.Schema.Type<typeof Configuration> {}

/** A new agent: its name, its configuration, and the role its membership starts with. */
export const CreateInput = Schema.Struct({
  name: Member.NewName,
  ...Configuration.fields,
  roleId: Role.Id,
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const ConfigureInput = Schema.Struct({ agentId: Id, ...Configuration.fields });
export interface ConfigureInput extends Schema.Schema.Type<typeof ConfigureInput> {}

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
  model: ModelSelection,
  environmentId: EnvironmentId.Id,
});
export interface Configured extends Schema.Schema.Type<typeof Configured> {}

/**
 * Why an agent cannot run as configured: its environment or connection is gone, or the
 * environment cannot run its model selection.
 */
export const Issue = Schema.Union([
  EnvironmentCompatibility.Reason,
  Schema.TaggedStruct("EnvironmentUnavailable", {}),
  Schema.TaggedStruct("ConnectionUnavailable", {}),
]);
export type Issue = typeof Issue.Type;

export const Readiness = Schema.TaggedUnion({
  Ready: {},
  Incomplete: { issues: Schema.NonEmptyArray(Issue) },
});
export type Readiness = typeof Readiness.Type;

/** An agent as its readers see it. */
export const View = Schema.Struct({
  id: Id,
  memberId: MemberId.Id,
  /** Its membership's name. */
  name: Member.Name,
  instructions: Instructions,
  model: ModelSelection,
  environmentId: EnvironmentId.Id,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
  /**
   * The role its membership holds across the workspace, when the reader may read its access; null
   * when they may not, or when it holds none.
   */
  role: Schema.NullOr(Schema.Struct({ id: Role.Id, name: Schema.NonEmptyString })),
  /** Whether the reader may change its name and configuration. */
  configurable: Schema.Boolean,
  /**
   * Whether the reader may remove it: configuring it and removing members, within the delegation
   * rules, which leave an agent holding more than Member to the owner.
   */
  removable: Schema.Boolean,
  /** Whether the reader may ask it for work. */
  usable: Schema.Boolean,
  readiness: Readiness,
});
export interface View extends Schema.Schema.Type<typeof View> {}

/** Whether a candidate environment can run a model selection, for choosing where an agent starts. */
export const EnvironmentChoice = Schema.Struct({
  environmentId: EnvironmentId.Id,
  compatibility: EnvironmentCompatibility.Compatibility,
});
export interface EnvironmentChoice extends Schema.Schema.Type<typeof EnvironmentChoice> {}

export * as Agent from "./agent.ts";

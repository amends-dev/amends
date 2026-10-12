/**
 * An agent is a workspace member that works, as its instructions say, on a harness and a model, and
 * in a sandbox when it needs one, each given by one of the workspace's connections, as
 * `@amends-dev/core/connection` keeps them. Its name, its role, and whether it is still in the
 * workspace are its membership's, which it joins with as any member does. This module holds its
 * record, the parts of its setup, the inputs of the operations that create, configure, and rename
 * one, and the view readers see, with its readiness; `AgentService` is those operations, and
 * `AgentReadiness` finds the readiness.
 *
 * @since 0.1.0
 */
import { ModelEndpoint } from "@amends-dev/harness";
import { Schema } from "effect";
import * as Role from "../authorization/Role.ts";
import * as Connection from "../connection/Connection.ts";
import * as Identity from "../identity/Identity.ts";
import * as Text from "../text/Text.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as Member from "../workspace/Member.ts";

/**
 * An agent's identity, which its membership refers to: `Identity.AgentId`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Identity.AgentId;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = Identity.AgentId;

/**
 * What an agent works by, its system prompt: up to 20,000 characters.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Instructions = Schema.String.check(Schema.isMaxLength(20_000));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Instructions = typeof Instructions.Type;

/**
 * Instructions given now, without surrounding space, which storage keeps as given. Creating and
 * configuring take them; `Instructions` is what is stored.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewInstructions = Schema.Trimmed.check(Schema.isMaxLength(20_000), Text.isStorable);

/**
 * The harness an agent runs on: that of one of the workspace's connections that gives harnesses,
 * or `Auto`, for amends to choose among them as the agent works.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Harness = Schema.TaggedUnion({
  Auto: {},
  Connection: { connectionId: Connection.Id },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Harness = typeof Harness.Type;

// TODO: Add the models a turn can name besides an agent's model, and the most an answer may write,
// once a turn names a model or a person sets a limit.
/**
 * The model an agent runs on: one that a connection offers, by the id its provider gives it, and how
 * hard it reasons, which is the model's default when absent.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Model = Schema.Struct({
  connectionId: Connection.Id,
  id: Schema.NonEmptyString,
  effort: Schema.optionalKey(ModelEndpoint.Effort),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Model extends Schema.Schema.Type<typeof Model> {}

/**
 * A model chosen now, whose id has no surrounding space. Creating and configuring take it;
 * `Model` is what is stored.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewModel = Schema.Struct({
  ...Model.fields,
  id: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(200), Text.isStorable),
});

// TODO: Add how an agent's sandboxes are prepared, such as the image they start from and the
// commands that set them up, and the network they reach, once an agent's work needs them.
/**
 * Where an agent works: the sandboxes of one of the workspace's connections that gives them.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Sandbox = Schema.Struct({ connectionId: Connection.Id });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Sandbox extends Schema.Schema.Type<typeof Sandbox> {}

/**
 * The harness, model, and sandbox a turn runs on: an agent's setup, with its harness chosen when it
 * is on `Auto`. A turn that runs again runs on the selection it started with. `AgentQuery.select`
 * makes it, and `Turn.Turn` keeps it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Selection = Schema.Struct({
  harness: Schema.Struct({ connectionId: Connection.Id }),
  model: Model,
  sandbox: Schema.NullOr(Sandbox),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Selection extends Schema.Schema.Type<typeof Selection> {}

/**
 * An agent as created and since configured: its membership, its instructions, and the harness,
 * model, and sandbox it runs on. `AgentStore` keeps it, and `AgentProjection` writes it from
 * `AgentFacts`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Agent = Schema.Struct({
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
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Agent extends Schema.Schema.Type<typeof Agent> {}

/**
 * The record with some fields changed, as a new record; the one given is left as it is.
 *
 * @category utils
 * @since 0.1.0
 */
export const change = (record: Agent, changes: Partial<Agent>): Agent =>
  Object.assign({}, record, changes);

/**
 * How an agent is set up, which configuring replaces as a whole: its instructions, harness,
 * model, and sandbox. Creating and configuring take it, and a configuration equal to the agent's
 * changes nothing.
 *
 * @category options
 * @since 0.1.0
 */
export const Configuration = Schema.Struct({
  instructions: NewInstructions,
  harness: Harness,
  model: NewModel,
  sandbox: Schema.NullOr(Sandbox),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface Configuration extends Schema.Schema.Type<typeof Configuration> {}

/**
 * A new agent: its name and the role it starts with, as its membership's, and how it is set up.
 *
 * @category options
 * @since 0.1.0
 */
export const CreateInput = Schema.Struct({
  name: Member.NewName,
  roleId: Role.Id,
  ...Configuration.fields,
});

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/**
 * The agent to configure, and how it is set up from now on.
 *
 * @category options
 * @since 0.1.0
 */
export const ConfigureInput = Schema.Struct({ agentId: Id, ...Configuration.fields });

/**
 * @category options
 * @since 0.1.0
 */
export interface ConfigureInput extends Schema.Schema.Type<typeof ConfigureInput> {}

/**
 * A new name, with the name it replaces, so that a rename made meanwhile is not overwritten.
 *
 * @category options
 * @since 0.1.0
 */
export const RenameInput = Schema.Struct({
  agentId: Id,
  name: Member.NewName,
  expectedName: Member.Name,
});

/**
 * @category options
 * @since 0.1.0
 */
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/**
 * What configuring records, the payload of `AgentFacts.Configured`: the agent, its membership,
 * and its setup as a whole.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Configured = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  agentId: Id,
  memberId: MemberId.Id,
  instructions: Instructions,
  harness: Harness,
  model: Model,
  sandbox: Schema.NullOr(Sandbox),
});
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Configured extends Schema.Schema.Type<typeof Configured> {}

/**
 * The part of an agent's setup that a connection gives, which an issue and
 * `CoreError.ConnectionUnusable` name.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Part = Schema.Literals(["harness", "model", "sandbox"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Part = typeof Part.Type;

/**
 * Why an agent cannot run as it is set up: the connection for one of its parts was removed, its
 * integration is no longer installed, or it no longer gives that part as the agent takes it, as
 * when its integration no longer offers the agent's model, which the integration describes; its
 * harness's agent works only in a sandbox and it has none; or, on `Auto`, no connection gives a
 * harness it can run on. `AgentReadiness` finds them.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Issue = Schema.TaggedUnion({
  Removed: { part: Part },
  Uninstalled: { part: Part },
  Invalid: { part: Part, description: Schema.String },
  SandboxRequired: {},
  NoHarness: {},
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Issue = typeof Issue.Type;

/**
 * Whether an agent can run as it is set up now, whoever reads it: ready, or incomplete for its
 * issues. Every view carries it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Readiness = Schema.TaggedUnion({
  Ready: {},
  Incomplete: { issues: Schema.NonEmptyArray(Issue) },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Readiness = typeof Readiness.Type;

/**
 * An agent as its readers see it, which `AgentService` returns. Its role and its removal are its
 * membership's, which members' operations read and change.
 *
 * @category schemas
 * @since 0.1.0
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
  /** Whether the reader may direct it: ask it for work, and stop or retry its turns. */
  usable: Schema.Boolean,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
/**
 * @category schemas
 * @since 0.1.0
 */
export interface View extends Schema.Schema.Type<typeof View> {}

/**
 * An agent named `name`, as ready as `readiness` says, as a reader with `access` sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const view = (
  record: Agent,
  name: Member.Name,
  readiness: Readiness,
  access: { readonly configurable: boolean; readonly usable: boolean },
): View => ({
  id: record.id,
  memberId: record.memberId,
  name,
  instructions: record.instructions,
  harness: record.harness,
  model: record.model,
  sandbox: record.sandbox,
  readiness,
  configurable: access.configurable,
  usable: access.usable,
  createdBy: record.createdBy,
  createdAt: record.createdAt,
});

import type { HarnessImplementation } from "@amends/harness";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Assignment } from "../authorization/assignment/assignment.ts";
import { AssignmentFacts } from "../authorization/assignment/facts.ts";
import { AssignmentPermissions } from "../authorization/assignment/permissions.ts";
import { AssignmentStore } from "../authorization/assignment/store.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Delegation } from "../authorization/delegation.ts";
import type { Permission } from "../authorization/permission.ts";
import { Requirement } from "../authorization/requirement.ts";
import { RoleStore } from "../authorization/role/store.ts";
import { Target } from "../authorization/target.ts";
import { ConnectionCatalog } from "../connection/catalog.ts";
import { Connection } from "../connection/connection.ts";
import { ConnectionPermissions } from "../connection/permissions.ts";
import { ConnectionStore } from "../connection/store.ts";
import { EnvironmentCatalog } from "../environment/catalog.ts";
import { EnvironmentCompatibility } from "../environment/compatibility.ts";
import { Environment } from "../environment/environment.ts";
import { EnvironmentPermissions } from "../environment/permissions.ts";
import { EnvironmentStore } from "../environment/store.ts";
import { Group } from "../group/group.ts";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import { GroupMembership } from "../group/membership/membership.ts";
import { GroupStore } from "../group/store.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Request } from "../request/request.ts";
import { MemberApplication } from "../workspace/member/application.ts";
import { MemberFacts } from "../workspace/member/facts.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberPermissions } from "../workspace/member/permissions.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { WorkspaceStore } from "../workspace/store.ts";
import { Workspace } from "../workspace/workspace.ts";
import { Agent } from "./agent.ts";
import {
  Changed,
  ConnectionUnavailable,
  EnvironmentUnavailable,
  Incompatible,
  NotFound,
} from "./errors.ts";
import { AgentFacts } from "./facts.ts";
import { AgentPermissions } from "./permissions.ts";
import { AgentStore } from "./store.ts";
export {
  Changed,
  ConnectionUnavailable,
  EnvironmentUnavailable,
  Incompatible,
  NotFound,
} from "./errors.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "AgentApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type ReadError =
  | Authorization.Error
  | AgentStore.Failure
  | MemberStore.Failure
  | AssignmentStore.Failure
  | RoleStore.Failure
  | WorkspaceStore.Failure
  | EnvironmentStore.Failure
  | ConnectionStore.Failure
  | Schema.SchemaError
  | NotFound
  | InvalidResponse;
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;
/** Model access or an environment the actor cannot use, or that cannot run together. */
export type SelectionError = ConnectionUnavailable | EnvironmentUnavailable | Incompatible;
/** Creating also grants the agent's role, and may meet a request key used before. */
export type CreateError = Error | SelectionError | Delegation.Error | GroupStore.Failure;
export type ConfigureError = Error | SelectionError;
export type RemoveError = Error | MemberApplication.RemoveError;
/** Choosing concerns no agent yet: only the connection can be unavailable. */
export type ChoicesError = Exclude<ReadError, NotFound> | ConnectionUnavailable;

/** The model access an agent would ask for, for choosing where it starts. */
export interface ChoicesInput {
  readonly model: Agent.ModelSelection;
}

export interface Interface {
  readonly workspaceId: Agent.Record["workspaceId"];
  /** The workspace's agents the actor may read, by name; those whose membership ended are gone. */
  readonly list: Effect.Effect<ReadonlyArray<Agent.View>, ReadError, Actor.Service>;
  readonly get: (agentId: Agent.Id) => Effect.Effect<Agent.View, ReadError, Actor.Service>;
  /**
   * Add an agent: a workspace membership with its name and initial role, which the actor must be
   * able to grant, and its configuration. The actor must be able to read and use its connection
   * and environment. Either may still need setup; an environment that cannot run the model access
   * at all is refused.
   */
  readonly create: (
    input: Agent.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<Agent.View, CreateError, Actor.Service>;
  /** Replace its instructions, model access, and environment, checked as creating checks them. */
  readonly configure: (
    input: Agent.ConfigureInput,
  ) => Effect.Effect<Agent.View, ConfigureError, Actor.Service>;
  /** Rename its membership; a rename made meanwhile conflicts. */
  readonly rename: (
    input: Agent.RenameInput,
  ) => Effect.Effect<Agent.View, Error | Changed, Actor.Service>;
  /** End its membership, as removing any member does; its record remains for history. */
  readonly remove: (agentId: Agent.Id) => Effect.Effect<void, RemoveError, Actor.Service>;
  /**
   * The environments the actor may read and use, each with whether it can run this model access,
   * so a choice is made against the same check creating and configuring apply.
   */
  readonly environmentChoices: (
    input: ChoicesInput,
  ) => Effect.Effect<ReadonlyArray<Agent.EnvironmentChoice>, ChoicesError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/agent/application/Service",
) {}

/** What the reader may do with an agent, and the role it holds when they may read its access. */
interface Access {
  readonly role: Agent.View["role"];
  readonly configurable: boolean;
  readonly removable: boolean;
  readonly usable: boolean;
}

/**
 * Reasons that only readiness can clear: the environment or the connection still needs setup.
 * Saving waits for neither; each shows on the agent until resolved.
 */
const pending = (reason: EnvironmentCompatibility.Reason) =>
  reason._tag === "EnvironmentNotReady" || reason._tag === "ConnectionNotReady";

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("AgentApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const agents = yield* AgentStore.Service;
  const members = yield* MemberStore.Service;
  const memberships = yield* MemberApplication.Service;
  const assignments = yield* AssignmentStore.Service;
  const roles = yield* RoleStore.Service;
  const workspace = yield* WorkspaceStore.Service;
  const groups = yield* GroupStore.Service;
  const environments = yield* EnvironmentStore.Service;
  const connections = yield* ConnectionStore.Service;
  const environmentCatalog = yield* EnvironmentCatalog.Service;
  const connectionCatalog = yield* ConnectionCatalog.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      delegation.workspaceId,
      agents.workspaceId,
      members.workspaceId,
      memberships.workspaceId,
      assignments.workspaceId,
      roles.workspaceId,
      workspace.workspaceId,
      groups.workspaceId,
      environments.workspaceId,
      connections.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({ message: "Agent services belong to different workspaces" });

  const memberTarget = (memberId: Member.Id) =>
    Target.Reference.cases.Member.make({ workspaceId, memberId });
  const connectionTarget = (connectionId: Connection.Id) =>
    ({ _tag: "Connection", workspaceId, connectionId }) as const;
  const environmentTarget = (environmentId: Environment.Id) =>
    ({ _tag: "Environment", workspaceId, environmentId }) as const;

  const invalid = (message: string) => new InvalidResponse({ message });
  const decodeAgent = Schema.decodeEffect(Schema.toType(Agent.Record));
  const decodeMember = Schema.decodeEffect(Schema.toType(Member.Record));
  const decodeEnvironment = Schema.decodeEffect(Schema.toType(Environment.Record));
  const decodeConnection = Schema.decodeEffect(Schema.toType(Connection.Record));
  const decoded = (record: Agent.Record) =>
    decodeAgent(record).pipe(
      Effect.mapError((cause) => invalid(`Agent store returned invalid data: ${cause.message}`)),
    );

  /** The agent's active membership, which names it; an ended one makes the agent missing. */
  const membershipOf = Effect.fnUntraced(function* (record: Agent.Record) {
    const found = yield* members.get(record.memberId);
    if (Option.isNone(found)) return yield* invalid("Agent membership is missing");
    const member = yield* decodeMember(found.value);
    if (
      member.workspaceId !== workspaceId ||
      member.identity._tag !== "Agent" ||
      member.identity.id !== record.id
    )
      return yield* invalid("Member store returned another member for this agent");
    if (member.name === undefined) return yield* invalid("Agent membership has no name");
    return { member, name: member.name };
  });
  /** The agent by ID with its membership, or NotFound once its membership ended. */
  const load = Effect.fnUntraced(function* (agentId: Agent.Id) {
    const found = yield* agents.get(agentId);
    if (Option.isNone(found)) return yield* new NotFound({ agentId });
    const record = yield* decoded(found.value);
    if (record.workspaceId !== workspaceId || record.id !== agentId)
      return yield* invalid("Agent store returned another agent or workspace");
    const { member, name } = yield* membershipOf(record);
    if (member.status !== "active") return yield* new NotFound({ agentId });
    return { record, name };
  });
  /** An agent the actor may act on with `permission`; to anyone else it is missing. */
  const authorized = Effect.fnUntraced(function* (
    agentId: Agent.Id,
    permission: Permission.Definition<"Member">,
  ) {
    const loaded = yield* load(agentId);
    const target = memberTarget(loaded.record.memberId);
    const [readable = false, permitted = false] = yield* authorization.permitted([
      Requirement.make(AgentPermissions.Read, target),
      Requirement.make(permission, target),
    ]);
    if (!readable) return yield* new NotFound({ agentId });
    if (!permitted) yield* authorization.require([Requirement.make(permission, target)]);
    return loaded;
  });

  const activeEnvironment = Effect.fnUntraced(function* (environmentId: Environment.Id) {
    const found = yield* environments.get(environmentId);
    if (Option.isNone(found)) return Option.none<Environment.Record>();
    const record = yield* decodeEnvironment(found.value);
    return record.workspaceId === workspaceId && record.status === "active"
      ? Option.some(record)
      : Option.none();
  });
  const activeConnection = Effect.fnUntraced(function* (connectionId: Connection.Id) {
    const found = yield* connections.get(connectionId);
    if (Option.isNone(found)) return Option.none<Connection.Record>();
    const record = yield* decodeConnection(found.value);
    return record.workspaceId === workspaceId && record.status === "active"
      ? Option.some(record)
      : Option.none();
  });
  /** An environment as readiness sees it now, with its account connection looked up. */
  const environmentView = Effect.fnUntraced(function* (record: Environment.Record) {
    const accountId = record.sandbox?.connectionId ?? null;
    const account = accountId === null ? Option.none() : yield* connections.get(accountId);
    const readiness = EnvironmentCompatibility.readiness(
      record,
      {
        harness: environmentCatalog.harness(record.harnessId),
        sandbox:
          record.sandbox === null
            ? Option.none()
            : environmentCatalog.sandbox(record.sandbox.providerId),
      },
      {
        record: account,
        declaration: Option.flatMap(account, (found) =>
          connectionCatalog.get(found.implementationId),
        ),
      },
    );
    return Environment.view(record, false, readiness);
  });
  const connectionView = (record: Connection.Record) =>
    Connection.view(
      record,
      Option.getOrUndefined(connectionCatalog.get(record.implementationId)),
      false,
    );
  const harnessOf = (record: Environment.Record): HarnessImplementation.Declaration | undefined =>
    Option.getOrUndefined(environmentCatalog.harness(record.harnessId));
  const compatibility = Effect.fnUntraced(function* (
    environment: Environment.Record,
    connection: Connection.Record,
    model: Agent.ModelSelection,
  ) {
    return EnvironmentCompatibility.check(
      yield* environmentView(environment),
      harnessOf(environment),
      {
        connection: connectionView(connection),
        model: model.model,
        ...(model.reasoning === null ? {} : { reasoning: model.reasoning }),
      },
    );
  });

  /** Whether the agent can run as configured now, whoever reads it. */
  const readinessOf = Effect.fnUntraced(function* (record: Agent.Record) {
    const environment = yield* activeEnvironment(record.environmentId);
    const connection = yield* activeConnection(record.model.connectionId);
    const issues: Array<Agent.Issue> = [];
    if (Option.isNone(environment)) issues.push({ _tag: "EnvironmentUnavailable" });
    if (Option.isNone(connection)) issues.push({ _tag: "ConnectionUnavailable" });
    if (Option.isSome(environment) && Option.isSome(connection)) {
      const checked = yield* compatibility(environment.value, connection.value, record.model);
      if (checked._tag === "Incompatible") issues.push(...checked.reasons);
    }
    const [first, ...rest] = issues;
    return first === undefined
      ? ({ _tag: "Ready" } as const)
      : ({ _tag: "Incomplete", issues: [first, ...rest] } as const);
  });
  const viewOf = Effect.fnUntraced(function* (
    record: Agent.Record,
    name: Member.Name,
    access: Access,
  ) {
    return {
      id: record.id,
      memberId: record.memberId,
      name,
      instructions: record.instructions,
      model: record.model,
      environmentId: record.environmentId,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      role: access.role,
      configurable: access.configurable,
      removable: access.removable,
      usable: access.usable,
      readiness: yield* readinessOf(record),
    } satisfies Agent.View;
  });
  const ownerOf = Effect.gen(function* () {
    const found = yield* workspace.get;
    if (Option.isNone(found)) return yield* invalid("Workspace metadata is missing");
    return (yield* Schema.decodeEffect(Workspace.Record)(found.value)).ownerMemberId;
  });
  /** The role a membership holds across the workspace, if any, by its current name. */
  const roleOf = Effect.fnUntraced(function* (assigned: ReadonlyArray<Assignment.Record>) {
    const source = assigned.find(
      (assignment) =>
        assignment.source._tag === "Role" && assignment.source.scope._tag === "Workspace",
    )?.source;
    if (source?._tag !== "Role") return null;
    const found = yield* roles.get(source.roleId);
    return Option.isSome(found) ? { id: found.value.id, name: found.value.name } : null;
  });
  /**
   * What the actor may do with each agent, by one grant resolution: whether they may read it, and
   * its access for the view. Removal follows member removal and its delegation rules.
   */
  const accessOf = Effect.fnUntraced(function* (records: ReadonlyArray<Agent.Record>) {
    const permissions = [
      AgentPermissions.Read,
      AgentPermissions.Configure,
      AgentPermissions.Use,
      AssignmentPermissions.Read,
      MemberPermissions.Remove,
    ] as const;
    const permitted = yield* authorization.permitted(
      records.flatMap((record) =>
        permissions.map((permission) =>
          Requirement.make(permission, memberTarget(record.memberId)),
        ),
      ),
    );
    const ownerId = yield* ownerOf;
    const actorId = (yield* Actor.Service).memberId;
    return yield* Effect.forEach(records, (record, index) =>
      Effect.gen(function* () {
        const [readable, configurable, usable, accessReadable, memberRemovable] = permissions.map(
          (_, offset) => permitted[index * permissions.length + offset] === true,
        );
        const removal: Delegation.Recipient = {
          workspaceId,
          memberId: record.memberId,
          ownerId,
          actorId,
          selfRemoval: true,
        };
        const mayRemove = configurable === true && memberRemovable === true;
        const assigned =
          accessReadable || (mayRemove && Delegation.recipientNeedsAssignments(removal))
            ? yield* Schema.decodeEffect(Schema.Array(Schema.toType(Assignment.Record)))(
                yield* assignments.listActiveByMember(record.memberId),
              )
            : [];
        const access: Access = {
          role: accessReadable ? yield* roleOf(assigned) : null,
          configurable: configurable === true,
          removable:
            mayRemove &&
            record.memberId !== ownerId &&
            Delegation.recipientDenial(removal, assigned) === undefined,
          usable: usable === true,
        };
        return { readable: readable === true, access };
      }),
    );
  });
  /** The agent as the actor sees it, including what they may do with it. */
  const presented = Effect.fnUntraced(function* (record: Agent.Record, name: Member.Name) {
    const [found] = yield* accessOf([record]);
    return yield* viewOf(
      record,
      name,
      found?.access ?? { role: null, configurable: false, removable: false, usable: false },
    );
  });

  /**
   * The connection and environment a configuration names, which the actor must be able to read
   * and use; to anyone else they are unavailable.
   */
  const usable = Effect.fnUntraced(function* (configuration: {
    readonly model: Agent.ModelSelection;
    readonly environmentId: Environment.Id;
  }) {
    const { connectionId } = configuration.model;
    const { environmentId } = configuration;
    const [connectionReadable, connectionUsable, environmentReadable, environmentUsable] =
      yield* authorization.permitted([
        Requirement.make(ConnectionPermissions.Read, connectionTarget(connectionId)),
        Requirement.make(ConnectionPermissions.Use, connectionTarget(connectionId)),
        Requirement.make(EnvironmentPermissions.Read, environmentTarget(environmentId)),
        Requirement.make(EnvironmentPermissions.Use, environmentTarget(environmentId)),
      ]);
    const connection = yield* activeConnection(connectionId);
    if (Option.isNone(connection) || !connectionReadable || !connectionUsable)
      return yield* new ConnectionUnavailable({ connectionId });
    const environment = yield* activeEnvironment(environmentId);
    if (Option.isNone(environment) || !environmentReadable || !environmentUsable)
      return yield* new EnvironmentUnavailable({ environmentId });
    return { connection: connection.value, environment: environment.value };
  });
  /** Refuse a configuration its environment cannot run; setup still pending does not refuse. */
  const checkConfiguration = Effect.fnUntraced(function* (configuration: Agent.Configuration) {
    const { connection, environment } = yield* usable(configuration);
    const checked = yield* compatibility(environment, connection, configuration.model);
    if (checked._tag === "Compatible") return;
    const [first, ...rest] = checked.reasons.filter((reason) => !pending(reason));
    if (first !== undefined) return yield* new Incompatible({ reasons: [first, ...rest] });
  });

  const committed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Publication.withActor,
      Effect.provideService(Crypto.Crypto, crypto),
      journal.commit,
    );

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const loaded: Array<{ readonly record: Agent.Record; readonly name: Member.Name }> = [];
    for (const found of yield* agents.list) {
      const record = yield* decoded(found);
      if (record.workspaceId !== workspaceId)
        return yield* invalid("Agent store returned another workspace");
      const { member, name } = yield* membershipOf(record);
      if (member.status === "active") loaded.push({ record, name });
    }
    const access = yield* accessOf(loaded.map(({ record }) => record));
    const views = yield* Effect.forEach(
      loaded.flatMap((entry, index) => {
        const found = access[index];
        return found?.readable ? [{ ...entry, access: found.access }] : [];
      }),
      ({ record, name, access }) => viewOf(record, name, access),
    );
    return views.toSorted((left, right) =>
      left.name === right.name
        ? left.id < right.id
          ? -1
          : 1
        : left.name.localeCompare(right.name),
    );
  }).pipe(Effect.withSpan("AgentApplication.list"));

  const get = Effect.fn("AgentApplication.get")(function* (agentId: Agent.Id) {
    const id = yield* Schema.decodeEffect(Agent.Id)(agentId);
    const { record, name } = yield* authorized(id, AgentPermissions.Read);
    return yield* presented(record, name);
  });

  const restore = Effect.fnUntraced(function* (agentId: Agent.Id) {
    const found = yield* agents.get(agentId);
    if (Option.isNone(found)) return yield* new NotFound({ agentId });
    const record = yield* decoded(found.value);
    const { name } = yield* membershipOf(record);
    return { record, name };
  });

  const create = Effect.fn("AgentApplication.create")(
    function* (input: Agent.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Agent.CreateInput))(input);
      yield* authorization.require([
        Requirement.make(AgentPermissions.Create, { _tag: "Workspace", workspaceId }),
      ]);
      yield* delegation.requireGrant(request.roleId);
      const actor = yield* Actor.Service;
      const agentId = Agent.Id.make(
        yield* Request.idFor(options.requestKey, ["agent.create", workspaceId, actor.memberId]),
      );
      // A retry returns the agent its first attempt created.
      if (options.requestKey !== undefined && Option.isSome(yield* agents.get(agentId))) {
        const { record, name } = yield* restore(agentId);
        return yield* presented(record, name);
      }
      yield* checkConfiguration(request);
      const createdAt = yield* DateTime.now;
      const created: Agent.Record = {
        id: agentId,
        workspaceId,
        memberId: Member.Id.make(yield* crypto.randomUUIDv4),
        instructions: request.instructions,
        model: request.model,
        environmentId: request.environmentId,
        createdBy: actor.memberId,
        createdAt,
      };
      yield* journal.publish(MemberFacts.Added, {
        memberId: created.memberId,
        workspaceId,
        identity: Identity.MemberReference.cases.Agent.make({ id: created.id }),
        name: request.name,
      });
      yield* journal.publish(AssignmentFacts.Created, {
        assignmentId: Assignment.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        memberId: created.memberId,
        source: Assignment.Source.cases.Role.make({
          roleId: request.roleId,
          scope: { _tag: "Workspace", workspaceId },
        }),
      });
      // An agent joins the general group as every member does.
      if (Option.isSome(yield* groups.get(Group.GeneralId)))
        yield* journal.publish(GroupMembershipFacts.Added, {
          id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
          workspaceId,
          groupId: Group.GeneralId,
          memberId: created.memberId,
          admittedAt: createdAt,
          status: "active",
        });
      yield* journal.publish(AgentFacts.Created, created);
      return yield* presented(created, request.name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const configure = Effect.fn("AgentApplication.configure")(function* (
    input: Agent.ConfigureInput,
  ) {
    const request = yield* Schema.decodeEffect(Schema.toType(Agent.ConfigureInput))(input);
    return yield* Effect.gen(function* () {
      const { record, name } = yield* authorized(request.agentId, AgentPermissions.Configure);
      const configuration = {
        instructions: request.instructions,
        model: request.model,
        environmentId: request.environmentId,
      };
      const next = Agent.change(record, configuration);
      if (
        Schema.toEquivalence(Schema.toType(Agent.Configuration))(configuration, {
          instructions: record.instructions,
          model: record.model,
          environmentId: record.environmentId,
        })
      )
        return yield* presented(next, name);
      yield* checkConfiguration(configuration);
      yield* journal.publish(AgentFacts.Configured, {
        workspaceId,
        agentId: record.id,
        memberId: record.memberId,
        ...configuration,
      });
      return yield* presented(next, name);
    }).pipe(committed);
  });

  const rename = Effect.fn("AgentApplication.rename")(function* (input: Agent.RenameInput) {
    const request = yield* Schema.decodeEffect(Schema.toType(Agent.RenameInput))(input);
    return yield* Effect.gen(function* () {
      const { record, name } = yield* authorized(request.agentId, AgentPermissions.Configure);
      if (name === request.name) return yield* presented(record, name);
      if (name !== request.expectedName) return yield* new Changed({ agentId: record.id });
      yield* journal.publish(MemberFacts.Renamed, {
        memberId: record.memberId,
        workspaceId,
        name: request.name,
      });
      return yield* presented(record, request.name);
    }).pipe(committed);
  });

  const remove = Effect.fn("AgentApplication.remove")(function* (agentId: Agent.Id) {
    const id = yield* Schema.decodeEffect(Agent.Id)(agentId);
    const { record } = yield* authorized(id, AgentPermissions.Configure);
    yield* memberships.remove(record.memberId);
  });

  const environmentChoices = Effect.fn("AgentApplication.environmentChoices")(function* (
    input: ChoicesInput,
  ) {
    const model = yield* Schema.decodeEffect(Schema.toType(Agent.ModelSelection))(input.model);
    yield* authorization.require([]);
    const { connectionId } = model;
    const [readable = false, permitted = false] = yield* authorization.permitted([
      Requirement.make(ConnectionPermissions.Read, connectionTarget(connectionId)),
      Requirement.make(ConnectionPermissions.Use, connectionTarget(connectionId)),
    ]);
    const connection = yield* activeConnection(connectionId);
    if (Option.isNone(connection) || !readable || !permitted)
      return yield* new ConnectionUnavailable({ connectionId });
    const active: Array<Environment.Record> = [];
    for (const found of yield* environments.list) {
      const record = yield* decodeEnvironment(found);
      if (record.workspaceId === workspaceId && record.status === "active") active.push(record);
    }
    const allowed = yield* authorization.permitted(
      active.flatMap((record) => [
        Requirement.make(EnvironmentPermissions.Read, environmentTarget(record.id)),
        Requirement.make(EnvironmentPermissions.Use, environmentTarget(record.id)),
      ]),
    );
    const choices = active.filter(
      (_, index) => allowed[index * 2] === true && allowed[index * 2 + 1] === true,
    );
    return yield* Effect.forEach(choices, (environment) =>
      Effect.map(
        compatibility(environment, connection.value, model),
        (checked): Agent.EnvironmentChoice => ({
          environmentId: environment.id,
          compatibility: checked,
        }),
      ),
    );
  });

  return Service.of({
    workspaceId,
    list,
    get,
    create,
    configure,
    rename,
    remove,
    environmentChoices,
  });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as AgentApplication from "./application.ts";

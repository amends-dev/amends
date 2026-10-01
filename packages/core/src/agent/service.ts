import type { HarnessImplementation } from "@amends/harness";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Assignment } from "../authorization/assignment/assignment.ts";

import { AssignmentPermissions } from "../authorization/assignment/permissions.ts";
import { AssignmentStore } from "../authorization/assignment/store.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Delegation } from "../authorization/delegation.ts";
import { AssignmentCommand } from "../authorization/assignment/command.ts";
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
import { EnvironmentQuery } from "../environment/query.ts";
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
import { Store } from "../journal/store.ts";
import { Request } from "../request/request.ts";
import { MemberService } from "../workspace/member/service.ts";
import { MemberFacts } from "../workspace/member/facts.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberPermissions } from "../workspace/member/permissions.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { WorkspaceStore } from "../workspace/store.ts";

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
  | NotFound;
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;
/** Model access or an environment the actor cannot use, or that cannot run together. */
export type SelectionError = ConnectionUnavailable | EnvironmentUnavailable | Incompatible;
/** Creating also grants the agent's role, and may meet a request key used before. */
export type CreateError = Error | SelectionError | Delegation.Error | GroupStore.Failure;
export type ConfigureError = Error | SelectionError;
export type RemoveError = Error | MemberService.RemoveError;
/** Choosing concerns no agent yet: only the connection can be unavailable. */
export type ChoicesError = Exclude<ReadError, NotFound> | ConnectionUnavailable;

/** The model access an agent would ask for, for choosing where it starts. */
export interface ChoicesInput {
  readonly model: Agent.ModelSelection;
}

export interface Interface {
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
  "@amends/core/agent/service/Service",
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
const isAwaitingSetup = (reason: EnvironmentCompatibility.Reason) =>
  reason._tag === "EnvironmentNotReady" || reason._tag === "ConnectionNotReady";

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("AgentService.make")(function* () {
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const assignmentCommand = yield* AssignmentCommand.Service;
  const agentStore = yield* AgentStore.Service;
  const memberStore = yield* MemberStore.Service;
  const memberService = yield* MemberService.Service;
  const assignmentStore = yield* AssignmentStore.Service;
  const roleStore = yield* RoleStore.Service;
  const workspaceStore = yield* WorkspaceStore.Service;
  const groupStore = yield* GroupStore.Service;
  const environmentStore = yield* EnvironmentStore.Service;
  const connectionStore = yield* ConnectionStore.Service;
  const environmentCatalog = yield* EnvironmentCatalog.Service;
  const environmentQuery = yield* EnvironmentQuery.Service;
  const connectionCatalog = yield* ConnectionCatalog.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const memberTarget = (memberId: Member.Id) =>
    Target.Reference.cases.Member.make({ workspaceId, memberId });
  const connectionTarget = (connectionId: Connection.Id) =>
    ({ _tag: "Connection", workspaceId, connectionId }) as const;
  const environmentTarget = (environmentId: Environment.Id) =>
    ({ _tag: "Environment", workspaceId, environmentId }) as const;

  /** The agent's active membership, which names it; an ended one makes the agent missing. */
  const readMembership = Effect.fnUntraced(function* (record: Agent.Record) {
    const found = yield* memberStore.get(record.memberId);
    // An agent is created with its named membership.
    if (Option.isNone(found) || found.value.name === undefined)
      return yield* Effect.die("An agent's named membership is missing");
    return { member: found.value, name: found.value.name };
  });
  /** The agent by ID with its membership, or NotFound once its membership ended. */
  const requireActiveAgent = Effect.fnUntraced(function* (agentId: Agent.Id) {
    const found = yield* agentStore.get(agentId);
    if (Option.isNone(found)) return yield* new NotFound({ agentId });
    const record = found.value;
    const { member, name } = yield* readMembership(record);
    if (member.status !== "active") return yield* new NotFound({ agentId });
    return { record, name };
  });
  /** An agent the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermittedAgent = Effect.fnUntraced(function* (
    agentId: Agent.Id,
    permission: Permission.Definition<"Member">,
  ) {
    const loaded = yield* requireActiveAgent(agentId);
    const target = memberTarget(loaded.record.memberId);
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(AgentPermissions.Read, target),
      Requirement.make(permission, target),
      () => new NotFound({ agentId }),
    );
    return loaded;
  });

  const findActiveEnvironment = Effect.fnUntraced(function* (environmentId: Environment.Id) {
    const found = yield* environmentStore.get(environmentId);
    return Option.filter(found, (record) => record.status === "active");
  });
  const findActiveConnection = Effect.fnUntraced(function* (connectionId: Connection.Id) {
    const found = yield* connectionStore.get(connectionId);
    return Option.filter(found, (record) => record.status === "active");
  });
  /** An environment as readiness sees it now. */
  const toEnvironmentView = Effect.fnUntraced(function* (record: Environment.Record) {
    return Environment.view(record, false, yield* environmentQuery.assessReadiness(record));
  });
  const toConnectionView = (record: Connection.Record) =>
    Connection.view(
      record,
      Option.getOrUndefined(connectionCatalog.get(record.implementationId)),
      false,
    );
  const findHarness = (record: Environment.Record): HarnessImplementation.Declaration | undefined =>
    Option.getOrUndefined(environmentCatalog.harness(record.harnessId));
  const checkCompatibility = Effect.fnUntraced(function* (
    environment: Environment.Record,
    connection: Connection.Record,
    model: Agent.ModelSelection,
  ) {
    return EnvironmentCompatibility.check(
      yield* toEnvironmentView(environment),
      findHarness(environment),
      {
        connection: toConnectionView(connection),
        model: model.model,
        ...(model.reasoning === null ? {} : { reasoning: model.reasoning }),
      },
    );
  });

  /** Whether the agent can run as configured now, whoever reads it. */
  const assessReadiness = Effect.fnUntraced(function* (record: Agent.Record) {
    const environment = yield* findActiveEnvironment(record.environmentId);
    const connection = yield* findActiveConnection(record.model.connectionId);
    const issues: Array<Agent.Issue> = [];
    if (Option.isNone(environment)) issues.push({ _tag: "EnvironmentUnavailable" });
    if (Option.isNone(connection)) issues.push({ _tag: "ConnectionUnavailable" });
    if (Option.isSome(environment) && Option.isSome(connection)) {
      const checked = yield* checkCompatibility(environment.value, connection.value, record.model);
      if (checked._tag === "Incompatible") issues.push(...checked.reasons);
    }
    const [first, ...rest] = issues;
    return first === undefined
      ? ({ _tag: "Ready" } as const)
      : ({ _tag: "Incomplete", issues: [first, ...rest] } as const);
  });
  const toView = Effect.fnUntraced(function* (
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
      readiness: yield* assessReadiness(record),
    } satisfies Agent.View;
  });
  const readOwnerId = Effect.gen(function* () {
    const found = yield* workspaceStore.get;
    if (Option.isNone(found)) return yield* Effect.die("A workspace's record is missing");
    return found.value.ownerMemberId;
  });
  /** The role a membership holds across the workspace, if any, by its current name. */
  const findWorkspaceRole = Effect.fnUntraced(function* (
    assigned: ReadonlyArray<Assignment.Record>,
  ) {
    const source = assigned.find(
      (assignment) =>
        assignment.source._tag === "Role" && assignment.source.scope._tag === "Workspace",
    )?.source;
    if (source?._tag !== "Role") return null;
    const found = yield* roleStore.get(source.roleId);
    return Option.isSome(found) ? { id: found.value.id, name: found.value.name } : null;
  });
  /**
   * What the actor may do with each agent, by one grant resolution: whether they may read it, and
   * its access for the view. Removal follows member removal and its delegation rules.
   */
  const resolveAccess = Effect.fnUntraced(function* (records: ReadonlyArray<Agent.Record>) {
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
    const ownerId = yield* readOwnerId;
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
            ? yield* assignmentStore.listActiveByMember(record.memberId)
            : [];
        const access: Access = {
          role: accessReadable ? yield* findWorkspaceRole(assigned) : null,
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
  const viewForActor = Effect.fnUntraced(function* (record: Agent.Record, name: Member.Name) {
    const [found] = yield* resolveAccess([record]);
    return yield* toView(
      record,
      name,
      found?.access ?? { role: null, configurable: false, removable: false, usable: false },
    );
  });

  /**
   * The connection and environment a configuration names, which the actor must be able to read
   * and use; to anyone else they are unavailable.
   */
  const requireUsableResources = Effect.fnUntraced(function* (configuration: {
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
    const connection = yield* findActiveConnection(connectionId);
    if (Option.isNone(connection) || !connectionReadable || !connectionUsable)
      return yield* new ConnectionUnavailable({ connectionId });
    const environment = yield* findActiveEnvironment(environmentId);
    if (Option.isNone(environment) || !environmentReadable || !environmentUsable)
      return yield* new EnvironmentUnavailable({ environmentId });
    return { connection: connection.value, environment: environment.value };
  });
  /** Refuse a configuration its environment cannot run; setup still pending does not refuse. */
  const checkConfiguration = Effect.fnUntraced(function* (configuration: Agent.Configuration) {
    const { connection, environment } = yield* requireUsableResources(configuration);
    const checked = yield* checkCompatibility(environment, connection, configuration.model);
    if (checked._tag === "Compatible") return;
    const [first, ...rest] = checked.reasons.filter((reason) => !isAwaitingSetup(reason));
    if (first !== undefined) return yield* new Incompatible({ reasons: [first, ...rest] });
  });

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const loaded: Array<{ readonly record: Agent.Record; readonly name: Member.Name }> = [];
    for (const record of yield* agentStore.list) {
      const { member, name } = yield* readMembership(record);
      if (member.status === "active") loaded.push({ record, name });
    }
    const access = yield* resolveAccess(loaded.map(({ record }) => record));
    const views = yield* Effect.forEach(
      loaded.flatMap((entry, index) => {
        const found = access[index];
        return found?.readable ? [{ ...entry, access: found.access }] : [];
      }),
      ({ record, name, access }) => toView(record, name, access),
    );
    return views.toSorted((left, right) =>
      left.name === right.name
        ? left.id < right.id
          ? -1
          : 1
        : left.name.localeCompare(right.name),
    );
  }).pipe(Effect.withSpan("AgentService.list"));

  const get = Effect.fn("AgentService.get")(function* (agentId: Agent.Id) {
    const id = yield* Schema.decodeEffect(Agent.Id)(agentId);
    const { record, name } = yield* requirePermittedAgent(id, AgentPermissions.Read);
    return yield* viewForActor(record, name);
  });

  const readRetriedAgent = Effect.fnUntraced(function* (agentId: Agent.Id) {
    const found = yield* agentStore.get(agentId);
    if (Option.isNone(found)) return yield* new NotFound({ agentId });
    const { name } = yield* readMembership(found.value);
    return { record: found.value, name };
  });

  const create = Effect.fn("AgentService.create")(
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
      if (options.requestKey !== undefined && Option.isSome(yield* agentStore.get(agentId))) {
        const { record, name } = yield* readRetriedAgent(agentId);
        return yield* viewForActor(record, name);
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
      yield* assignmentCommand.assignRole(created.memberId, request.roleId);
      // An agent joins the general group as every member does.
      if (Option.isSome(yield* groupStore.get(Group.GeneralId)))
        yield* journal.publish(GroupMembershipFacts.Added, {
          id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
          workspaceId,
          groupId: Group.GeneralId,
          memberId: created.memberId,
          admittedAt: createdAt,
          status: "active",
        });
      yield* journal.publish(AgentFacts.Created, created);
      return yield* viewForActor(created, request.name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const configure = Effect.fn("AgentService.configure")(
    function* (input: Agent.ConfigureInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Agent.ConfigureInput))(input);
      const { record, name } = yield* requirePermittedAgent(
        request.agentId,
        AgentPermissions.Configure,
      );
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
        return yield* viewForActor(next, name);
      yield* checkConfiguration(configuration);
      yield* journal.publish(AgentFacts.Configured, {
        workspaceId,
        agentId: record.id,
        memberId: record.memberId,
        ...configuration,
      });
      return yield* viewForActor(next, name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const rename = Effect.fn("AgentService.rename")(
    function* (input: Agent.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Agent.RenameInput))(input);
      const { record, name } = yield* requirePermittedAgent(
        request.agentId,
        AgentPermissions.Configure,
      );
      if (name === request.name) return yield* viewForActor(record, name);
      if (name !== request.expectedName) return yield* new Changed({ agentId: record.id });
      yield* journal.publish(MemberFacts.Renamed, {
        memberId: record.memberId,
        workspaceId,
        name: request.name,
      });
      return yield* viewForActor(record, request.name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const remove = Effect.fn("AgentService.remove")(function* (agentId: Agent.Id) {
    const id = yield* Schema.decodeEffect(Agent.Id)(agentId);
    const { record } = yield* requirePermittedAgent(id, AgentPermissions.Configure);
    yield* memberService.remove(record.memberId);
  });

  const environmentChoices = Effect.fn("AgentService.environmentChoices")(function* (
    input: ChoicesInput,
  ) {
    const model = yield* Schema.decodeEffect(Schema.toType(Agent.ModelSelection))(input.model);
    yield* authorization.require([]);
    const { connectionId } = model;
    const [readable = false, permitted = false] = yield* authorization.permitted([
      Requirement.make(ConnectionPermissions.Read, connectionTarget(connectionId)),
      Requirement.make(ConnectionPermissions.Use, connectionTarget(connectionId)),
    ]);
    const connection = yield* findActiveConnection(connectionId);
    if (Option.isNone(connection) || !readable || !permitted)
      return yield* new ConnectionUnavailable({ connectionId });
    const active: Array<Environment.Record> = [];
    for (const record of yield* environmentStore.list)
      if (record.status === "active") active.push(record);
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
        checkCompatibility(environment, connection.value, model),
        (checked): Agent.EnvironmentChoice => ({
          environmentId: environment.id,
          compatibility: checked,
        }),
      ),
    );
  });

  return Service.of({
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

export * as AgentService from "./service.ts";

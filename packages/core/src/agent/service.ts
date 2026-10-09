import { Integrations } from "@amends/connection";
import { Array, Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Delegation } from "../authorization/delegation.ts";
import type { Permission } from "../authorization/permission.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Target } from "../authorization/target.ts";
import type { Connection } from "../connection/connection.ts";
import { ConnectionPermissions } from "../connection/permissions.ts";
import { ConnectionStore } from "../connection/store.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Request } from "../request/request.ts";
import { MemberCommand } from "../workspace/member/command.ts";
import { MemberFacts } from "../workspace/member/facts.ts";
import type { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Agent } from "./agent.ts";
import { Changed, ConnectionUnavailable, Incomplete, NotFound } from "./errors.ts";
import { AgentFacts } from "./facts.ts";
import { AgentPermissions } from "./permissions.ts";
import { AgentReadiness } from "./readiness.ts";
import { AgentStore } from "./store.ts";
export { Changed, ConnectionUnavailable, Incomplete, NotFound } from "./errors.ts";

export type ListError =
  | Authorization.Error
  | AgentStore.Failure
  | MemberStore.Failure
  | ConnectionStore.Failure;
/** Reading one agent, which can be missing. */
export type ReadError = ListError | Schema.SchemaError | NotFound;
/** What every change can meet besides reading. */
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;
/** A setup naming a connection the actor may not give an agent, or one that cannot run. */
export type SetupError = ConnectionUnavailable | Incomplete;
/** Creating also adds a membership, with a role the actor must be able to grant. */
export type CreateError = Error | SetupError | Delegation.Error | MemberCommand.Error;
export type ConfigureError = Error | SetupError;
export type RenameError = Error | Changed;

/**
 * The workspace's agents. An agent is a member, so its role is changed, and it is removed, as any
 * member's is, by members' and assignments' operations.
 */
export interface Interface {
  /** The workspace's agents the actor may read, by name; those whose membership ended are gone. */
  readonly list: Effect.Effect<ReadonlyArray<Agent.View>, ListError, Actor.Service>;
  readonly get: (agentId: Agent.Id) => Effect.Effect<Agent.View, ReadError, Actor.Service>;
  /**
   * Add an agent: a membership, with its name and the role it starts with, which the actor must be
   * able to grant, and how it is set up. The actor must be able to read and use each connection
   * the setup names, and an agent set up so must be able to run, except that one on `Auto` may
   * have no harness to choose yet.
   */
  readonly create: (
    input: Agent.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<Agent.View, CreateError, Actor.Service>;
  /** Replace how the agent is set up, as a whole, checked as creating checks it. */
  readonly configure: (
    input: Agent.ConfigureInput,
  ) => Effect.Effect<Agent.View, ConfigureError, Actor.Service>;
  /** Rename its membership; a rename made meanwhile conflicts. */
  readonly rename: (
    input: Agent.RenameInput,
  ) => Effect.Effect<Agent.View, RenameError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/agent/service/Service",
) {}

/** An agent's membership's name; an agent joins with one, and only it can rename it. */
const nameOf = (member: Member.Record) =>
  member.name === undefined
    ? Effect.die("An agent's membership has no name")
    : Effect.succeed(member.name);

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("AgentService.make")(function* () {
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const memberCommand = yield* MemberCommand.Service;
  const agentStore = yield* AgentStore.Service;
  const memberStore = yield* MemberStore.Service;
  const connectionStore = yield* ConnectionStore.Service;
  const integrations = yield* Integrations.Integrations;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const memberTarget = (memberId: Member.Id) =>
    Target.Reference.cases.Member.make({ workspaceId, memberId });
  const connectionTarget = (connectionId: Connection.Id) =>
    Target.Reference.cases.Connection.make({ workspaceId, connectionId });

  /** Whether the agent can run as it is set up, as the host's integrations find its connections. */
  const readinessOf = (record: Agent.Record, connections: AgentReadiness.Connections) =>
    Effect.map(
      AgentReadiness.issuesOf(record, connections, integrations),
      AgentReadiness.readinessOf,
    );

  /** The agent by ID with its name while its membership lasts, and NotFound once it ended. */
  const requireActiveAgent = Effect.fnUntraced(function* (agentId: Agent.Id) {
    const found = yield* agentStore.get(agentId);
    if (Option.isNone(found)) return yield* new NotFound({ agentId });
    const member = yield* memberStore.get(found.value.memberId);
    if (Option.isNone(member) || member.value.status !== "active")
      return yield* new NotFound({ agentId });
    return { record: found.value, name: yield* nameOf(member.value) };
  });

  /** An agent the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermittedAgent = Effect.fnUntraced(function* (
    agentId: Agent.Id,
    permission: Permission.Definition<"Member">,
  ) {
    const agent = yield* requireActiveAgent(agentId);
    const target = memberTarget(agent.record.memberId);
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(AgentPermissions.Read, target),
      Requirement.make(permission, target),
      () => new NotFound({ agentId }),
    );
    return agent;
  });

  /** The agent as the actor sees it, including whether they may configure and direct it. */
  const viewForActor = Effect.fnUntraced(function* (record: Agent.Record, name: Member.Name) {
    const [configurable = false, usable = false] = yield* authorization.permitted([
      Requirement.make(AgentPermissions.Configure, memberTarget(record.memberId)),
      Requirement.make(AgentPermissions.Use, memberTarget(record.memberId)),
    ]);
    const readiness = yield* readinessOf(record, yield* connectionStore.listActive);
    return Agent.view(record, name, readiness, { configurable, usable });
  });

  /**
   * Fails unless the actor may give an agent each connection `setup` names, reading and using it,
   * and an agent set up so can run. One on `Auto` may have no harness to choose yet, since a
   * connection that gives one can be added after it.
   */
  const checkSetup = Effect.fnUntraced(function* (setup: AgentReadiness.Setup) {
    const named = AgentReadiness.namedConnections(setup);
    // One grant resolution answers both permissions for every connection named.
    const permitted = yield* authorization.permitted(
      named.flatMap(({ connectionId }) => [
        Requirement.make(ConnectionPermissions.Read, connectionTarget(connectionId)),
        Requirement.make(ConnectionPermissions.Use, connectionTarget(connectionId)),
      ]),
    );
    const connections = yield* connectionStore.listActive;
    for (const [index, { part, connectionId }] of named.entries()) {
      const [readable = false, usable = false] = permitted.slice(index * 2, index * 2 + 2);
      const active = connections.some((connection) => connection.id === connectionId);
      if (!readable || !usable || !active)
        return yield* new ConnectionUnavailable({ part, connectionId });
    }
    const issues = (yield* AgentReadiness.issuesOf(setup, connections, integrations)).filter(
      (issue) => issue._tag !== "NoHarness",
    );
    if (Array.isReadonlyArrayNonEmpty(issues)) return yield* new Incomplete({ issues });
  });

  /** The agents whose membership lasts, each with its name, in no particular order. */
  const activeAgents = Effect.gen(function* () {
    const records = yield* agentStore.list;
    const members = yield* memberStore.getMany(records.map((record) => record.memberId));
    const membersById = new Map(members.map((member) => [member.id, member]));
    const active: Array<{ readonly record: Agent.Record; readonly name: Member.Name }> = [];
    for (const record of records) {
      const member = membersById.get(record.memberId);
      if (member?.status === "active") active.push({ record, name: yield* nameOf(member) });
    }
    return active;
  });

  /** Views by name, and by id among agents of one name. */
  const byName = (left: Agent.View, right: Agent.View) =>
    left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1);

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const agents = yield* activeAgents;
    // One grant resolution answers the three permissions for every agent.
    const permitted = yield* authorization.permitted(
      agents.flatMap(({ record }) => [
        Requirement.make(AgentPermissions.Read, memberTarget(record.memberId)),
        Requirement.make(AgentPermissions.Configure, memberTarget(record.memberId)),
        Requirement.make(AgentPermissions.Use, memberTarget(record.memberId)),
      ]),
    );
    const connections = yield* connectionStore.listActive;
    const views: Array<Agent.View> = [];
    for (const [index, { record, name }] of agents.entries()) {
      const [readable = false, configurable = false, usable = false] = permitted.slice(
        index * 3,
        index * 3 + 3,
      );
      if (!readable) continue;
      const readiness = yield* readinessOf(record, connections);
      views.push(Agent.view(record, name, readiness, { configurable, usable }));
    }
    return views.toSorted(byName);
  }).pipe(Effect.withSpan("AgentService.list"));

  const get = Effect.fn("AgentService.get")(function* (agentId: Agent.Id) {
    const id = yield* Schema.decodeEffect(Agent.Id)(agentId);
    const { record, name } = yield* requirePermittedAgent(id, AgentPermissions.Read);
    return yield* viewForActor(record, name);
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
      // A retry returns the agent its first attempt created, unless its membership ended since.
      if (options.requestKey !== undefined && Option.isSome(yield* agentStore.get(agentId))) {
        const { record, name } = yield* requireActiveAgent(agentId);
        return yield* viewForActor(record, name);
      }
      yield* checkSetup(request);
      const joinedAt = yield* DateTime.now;
      const member = yield* memberCommand.add({
        identity: Identity.MemberReference.cases.Agent.make({ id: agentId }),
        name: request.name,
        roleId: request.roleId,
        joinedAt,
      });
      const created: Agent.Record = {
        id: agentId,
        workspaceId,
        memberId: member.id,
        instructions: request.instructions,
        harness: request.harness,
        model: request.model,
        sandbox: request.sandbox,
        createdBy: actor.memberId,
        createdAt: joinedAt,
      };
      yield* journal.publish(AgentFacts.Created, created);
      return yield* viewForActor(created, request.name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const sameConfiguration = Schema.toEquivalence(Schema.toType(Agent.Configuration));

  const configure = Effect.fn("AgentService.configure")(
    function* (input: Agent.ConfigureInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Agent.ConfigureInput))(input);
      const { record, name } = yield* requirePermittedAgent(
        request.agentId,
        AgentPermissions.Configure,
      );
      const configuration: Agent.Configuration = {
        instructions: request.instructions,
        harness: request.harness,
        model: request.model,
        sandbox: request.sandbox,
      };
      if (sameConfiguration(configuration, record)) return yield* viewForActor(record, name);
      yield* checkSetup(configuration);
      yield* journal.publish(AgentFacts.Configured, {
        workspaceId,
        agentId: record.id,
        memberId: record.memberId,
        instructions: configuration.instructions,
        harness: configuration.harness,
        model: configuration.model,
        sandbox: configuration.sandbox,
      });
      return yield* viewForActor(Agent.change(record, configuration), name);
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
        workspaceId,
        memberId: record.memberId,
        name: request.name,
      });
      return yield* viewForActor(record, request.name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({ list, get, create, configure, rename });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as AgentService from "./service.ts";

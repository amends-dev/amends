import { Integrations } from "@amends/connection-v2";
import { Array, Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Delegation } from "../authorization/delegation.ts";
import type { Permission } from "../authorization/permission.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Target } from "../authorization/target.ts";
import type { ConnectionV2 } from "../connection-v2/connection.ts";
import { ConnectionV2Permissions } from "../connection-v2/permissions.ts";
import { ConnectionV2Store } from "../connection-v2/store.ts";
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
import { AgentV2 } from "./agent.ts";
import { Changed, ConnectionUnavailable, Incomplete, NotFound } from "./errors.ts";
import { AgentV2Facts } from "./facts.ts";
import { AgentV2Permissions } from "./permissions.ts";
import { AgentV2Readiness } from "./readiness.ts";
import { AgentV2Store } from "./store.ts";
export { Changed, ConnectionUnavailable, Incomplete, NotFound } from "./errors.ts";

export type ListError =
  | Authorization.Error
  | AgentV2Store.Failure
  | MemberStore.Failure
  | ConnectionV2Store.Failure;
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
  readonly list: Effect.Effect<ReadonlyArray<AgentV2.View>, ListError, Actor.Service>;
  readonly get: (agentId: AgentV2.Id) => Effect.Effect<AgentV2.View, ReadError, Actor.Service>;
  /**
   * Add an agent: a membership, with its name and the role it starts with, which the actor must be
   * able to grant, and how it is set up. The actor must be able to read and use each connection
   * the setup names, and an agent set up so must be able to run, except that one on `Auto` may
   * have no harness to choose yet.
   */
  readonly create: (
    input: AgentV2.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<AgentV2.View, CreateError, Actor.Service>;
  /** Replace how the agent is set up, as a whole, checked as creating checks it. */
  readonly configure: (
    input: AgentV2.ConfigureInput,
  ) => Effect.Effect<AgentV2.View, ConfigureError, Actor.Service>;
  /** Rename its membership; a rename made meanwhile conflicts. */
  readonly rename: (
    input: AgentV2.RenameInput,
  ) => Effect.Effect<AgentV2.View, RenameError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/agent-v2/service/Service",
) {}

/** An agent's membership's name; an agent joins with one, and only it can rename it. */
const nameOf = (member: Member.Record) =>
  member.name === undefined
    ? Effect.die("An agent's membership has no name")
    : Effect.succeed(member.name);

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("AgentV2Service.make")(function* () {
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const memberCommand = yield* MemberCommand.Service;
  const agentV2Store = yield* AgentV2Store.Service;
  const memberStore = yield* MemberStore.Service;
  const connectionV2Store = yield* ConnectionV2Store.Service;
  const integrations = yield* Integrations.Integrations;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const memberTarget = (memberId: Member.Id) =>
    Target.Reference.cases.Member.make({ workspaceId, memberId });
  const connectionTarget = (connectionId: ConnectionV2.Id) =>
    ({ _tag: "ConnectionV2", workspaceId, connectionId }) as const;

  /** The workspace's connections that are not removed, by id, which agents' setups name. */
  const readConnections = Effect.map(
    connectionV2Store.listActive,
    (records): AgentV2Readiness.Connections =>
      new Map(records.map((record) => [record.id, record])),
  );

  /** Whether the agent can run as it is set up, as the host's integrations find its connections. */
  const readinessOf = (record: AgentV2.Record, connections: AgentV2Readiness.Connections) =>
    Effect.map(
      AgentV2Readiness.issuesOf(record, connections, integrations),
      AgentV2Readiness.readinessOf,
    );

  /** The agent by ID with its name while its membership lasts, and NotFound once it ended. */
  const requireActiveAgent = Effect.fnUntraced(function* (agentId: AgentV2.Id) {
    const found = yield* agentV2Store.get(agentId);
    if (Option.isNone(found)) return yield* new NotFound({ agentId });
    const member = yield* memberStore.get(found.value.memberId);
    if (Option.isNone(member) || member.value.status !== "active")
      return yield* new NotFound({ agentId });
    return { record: found.value, name: yield* nameOf(member.value) };
  });

  /** An agent the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermittedAgent = Effect.fnUntraced(function* (
    agentId: AgentV2.Id,
    permission: Permission.Definition<"Member">,
  ) {
    const agent = yield* requireActiveAgent(agentId);
    const target = memberTarget(agent.record.memberId);
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(AgentV2Permissions.Read, target),
      Requirement.make(permission, target),
      () => new NotFound({ agentId }),
    );
    return agent;
  });

  /** The agent as the actor sees it, including whether they may configure and direct it. */
  const viewForActor = Effect.fnUntraced(function* (record: AgentV2.Record, name: Member.Name) {
    const [configurable = false, usable = false] = yield* authorization.permitted([
      Requirement.make(AgentV2Permissions.Configure, memberTarget(record.memberId)),
      Requirement.make(AgentV2Permissions.Use, memberTarget(record.memberId)),
    ]);
    const readiness = yield* readinessOf(record, yield* readConnections);
    return AgentV2.view(record, name, readiness, { configurable, usable });
  });

  /**
   * Fails unless the actor may give an agent each connection `setup` names, reading and using it,
   * and an agent set up so can run. One on `Auto` may have no harness to choose yet, since a
   * connection that gives one can be added after it.
   */
  const checkSetup = Effect.fnUntraced(function* (setup: AgentV2Readiness.Setup) {
    const named: ReadonlyArray<{
      readonly part: AgentV2.Part;
      readonly connectionId: ConnectionV2.Id;
    }> = [
      ...(setup.harness._tag === "Connection"
        ? [{ part: "harness" as const, connectionId: setup.harness.connectionId }]
        : []),
      { part: "model", connectionId: setup.model.connectionId },
      ...(setup.sandbox === null
        ? []
        : [{ part: "sandbox" as const, connectionId: setup.sandbox.connectionId }]),
    ];
    // One grant resolution answers both permissions for every connection named.
    const permitted = yield* authorization.permitted(
      named.flatMap(({ connectionId }) => [
        Requirement.make(ConnectionV2Permissions.Read, connectionTarget(connectionId)),
        Requirement.make(ConnectionV2Permissions.Use, connectionTarget(connectionId)),
      ]),
    );
    const connections = yield* readConnections;
    for (const [index, { part, connectionId }] of named.entries()) {
      const usable = permitted[index * 2] === true && permitted[index * 2 + 1] === true;
      if (!usable || !connections.has(connectionId))
        return yield* new ConnectionUnavailable({ part, connectionId });
    }
    const issues = (yield* AgentV2Readiness.issuesOf(setup, connections, integrations)).filter(
      (issue) => issue._tag !== "NoHarness",
    );
    if (Array.isReadonlyArrayNonEmpty(issues)) return yield* new Incomplete({ issues });
  });

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const records = yield* agentV2Store.list;
    const members = new Map(
      (yield* memberStore.getMany(records.map((record) => record.memberId))).map((member) => [
        member.id,
        member,
      ]),
    );
    const active: Array<{ readonly record: AgentV2.Record; readonly name: Member.Name }> = [];
    for (const record of records) {
      const member = members.get(record.memberId);
      if (member?.status === "active") active.push({ record, name: yield* nameOf(member) });
    }
    // One grant resolution answers the three permissions for every agent.
    const permitted = yield* authorization.permitted(
      active.flatMap(({ record }) => [
        Requirement.make(AgentV2Permissions.Read, memberTarget(record.memberId)),
        Requirement.make(AgentV2Permissions.Configure, memberTarget(record.memberId)),
        Requirement.make(AgentV2Permissions.Use, memberTarget(record.memberId)),
      ]),
    );
    const connections = yield* readConnections;
    const views = yield* Effect.forEach(
      active.flatMap((agent, index) =>
        permitted[index * 3] === true
          ? [
              {
                ...agent,
                access: {
                  configurable: permitted[index * 3 + 1] === true,
                  usable: permitted[index * 3 + 2] === true,
                },
              },
            ]
          : [],
      ),
      ({ record, name, access }) =>
        Effect.map(readinessOf(record, connections), (readiness) =>
          AgentV2.view(record, name, readiness, access),
        ),
    );
    return views.toSorted(
      (left, right) => left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1),
    );
  }).pipe(Effect.withSpan("AgentV2Service.list"));

  const get = Effect.fn("AgentV2Service.get")(function* (agentId: AgentV2.Id) {
    const id = yield* Schema.decodeEffect(AgentV2.Id)(agentId);
    const { record, name } = yield* requirePermittedAgent(id, AgentV2Permissions.Read);
    return yield* viewForActor(record, name);
  });

  const create = Effect.fn("AgentV2Service.create")(
    function* (input: AgentV2.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(AgentV2.CreateInput))(input);
      yield* authorization.require([
        Requirement.make(AgentV2Permissions.Create, { _tag: "Workspace", workspaceId }),
      ]);
      yield* delegation.requireGrant(request.roleId);
      const actor = yield* Actor.Service;
      const agentId = AgentV2.Id.make(
        yield* Request.idFor(options.requestKey, ["agent-v2.create", workspaceId, actor.memberId]),
      );
      // A retry returns the agent its first attempt created, unless its membership ended since.
      if (options.requestKey !== undefined && Option.isSome(yield* agentV2Store.get(agentId))) {
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
      const created: AgentV2.Record = {
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
      yield* journal.publish(AgentV2Facts.Created, created);
      return yield* viewForActor(created, request.name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const sameConfiguration = Schema.toEquivalence(Schema.toType(AgentV2.Configuration));

  const configure = Effect.fn("AgentV2Service.configure")(
    function* (input: AgentV2.ConfigureInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(AgentV2.ConfigureInput))(input);
      const { record, name } = yield* requirePermittedAgent(
        request.agentId,
        AgentV2Permissions.Configure,
      );
      const configuration: AgentV2.Configuration = {
        instructions: request.instructions,
        harness: request.harness,
        model: request.model,
        sandbox: request.sandbox,
      };
      const configured = AgentV2.change(record, configuration);
      if (sameConfiguration(configuration, record)) return yield* viewForActor(configured, name);
      yield* checkSetup(configuration);
      yield* journal.publish(AgentV2Facts.Configured, {
        workspaceId,
        agentId: record.id,
        memberId: record.memberId,
        instructions: configuration.instructions,
        harness: configuration.harness,
        model: configuration.model,
        sandbox: configuration.sandbox,
      });
      return yield* viewForActor(configured, name);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const rename = Effect.fn("AgentV2Service.rename")(
    function* (input: AgentV2.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(AgentV2.RenameInput))(input);
      const { record, name } = yield* requirePermittedAgent(
        request.agentId,
        AgentV2Permissions.Configure,
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

export * as AgentV2Service from "./service.ts";

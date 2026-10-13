/**
 * The operations on agents an actor calls: listing and reading the agents they may read, as
 * `Agent.View`, and creating, configuring, and renaming them. An agent is a member, so creating
 * one adds its membership through `MemberCommand`, and its role is changed, and it is removed, by
 * members' and assignments' operations. Each operation authorizes the actor itself, writes inside
 * one journal commit, and reads outside any; it exports the outcomes it reports.
 *
 * @since 0.1.0
 */

import { Integrations } from "@amends-dev/connection"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Authorization from "../authorization/Authorization.ts"
import * as Delegation from "../authorization/Delegation.ts"
import type * as Permission from "../authorization/Permission.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import type * as Connection from "../connection/Connection.ts"
import * as ConnectionPermissions from "../connection/ConnectionPermissions.ts"
import * as ConnectionStore from "../connection/ConnectionStore.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Identity from "../identity/Identity.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Store from "../journal/Store.ts"
import * as Operation from "../operation/Operation.ts"
import * as Request from "../request/Request.ts"
import type * as Member from "../workspace/Member.ts"
import * as MemberCommand from "../workspace/MemberCommand.ts"
import * as MemberFacts from "../workspace/MemberFacts.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import * as Agent from "./Agent.ts"
import * as AgentFacts from "./AgentFacts.ts"
import * as AgentPermissions from "./AgentPermissions.ts"
import * as AgentReadiness from "./AgentReadiness.ts"
import * as AgentStore from "./AgentStore.ts"

/**
 * What listing agents can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ListError = CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * What reading one agent can fail with: a malformed ID, and a missing agent.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * What every change can fail with: what reading meets, and what its commit meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What creating can fail with. Creating also adds a membership, with a role the actor must be
 * able to grant.
 *
 * @category errors
 * @since 0.1.0
 */
export type CreateError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What configuring can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ConfigureError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What renaming can fail with: a rename made meanwhile, besides what every change meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type RenameError =
  | CoreError.NotFound
  | CoreError.Changed
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * The agent operations an actor calls. An agent is a member, so its role is changed, and it is
 * removed, as any member's is, by members' and assignments' operations.
 *
 * @category services
 * @since 0.1.0
 */
export class AgentService extends Context.Service<
  AgentService,
  {
    /** The workspace's agents the actor may read, by name; those whose membership ended are gone. */
    readonly list: Effect.Effect<ReadonlyArray<Agent.View>, ListError, Actor.Actor>
    /** The agent by ID, as the actor sees it; one they may not read is missing. */
    readonly get: (agentId: Agent.Id) => Effect.Effect<Agent.View, ReadError, Actor.Actor>
    /**
     * Add an agent: a membership, with its name and the role it starts with, which the actor must be
     * able to grant, and how it is set up. The actor must be able to read and use each connection
     * the setup names, and an agent set up so must be able to run, except that one on `Auto` may
     * have no harness to choose yet.
     */
    readonly create: (
      input: Agent.CreateInput,
      options?: Request.Options
    ) => Effect.Effect<Agent.View, CreateError, Actor.Actor>
    /** Replace how the agent is set up, as a whole, checked as creating checks it. */
    readonly configure: (input: Agent.ConfigureInput) => Effect.Effect<Agent.View, ConfigureError, Actor.Actor>
    /** Rename its membership; a rename made meanwhile is rejected. */
    readonly rename: (input: Agent.RenameInput) => Effect.Effect<Agent.View, RenameError, Actor.Actor>
  }
>()("@amends-dev/core/agent/AgentService") {}

/**
 * Capture workspace dependencies; resolve authority inside each operation.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("AgentService.make")(function* () {
  const authorization = yield* Authorization.Authorization
  const delegation = yield* Delegation.Delegation
  const memberCommand = yield* MemberCommand.MemberCommand
  const agentStore = yield* AgentStore.AgentStore
  const memberStore = yield* MemberStore.MemberStore
  const connectionStore = yield* ConnectionStore.ConnectionStore
  const integrations = yield* Integrations.Integrations
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const { workspaceId } = yield* Store.Store

  const memberTarget = (memberId: Member.Id) => Target.Reference.cases.Member.make({ workspaceId, memberId })
  const connectionTarget = (connectionId: Connection.Id) =>
    Target.Reference.cases.Connection.make({ workspaceId, connectionId })

  /** Whether the agent can run as it is set up, as the host's integrations find its connections. */
  const readinessOf = (record: Agent.Agent, connections: AgentReadiness.Connections) =>
    Effect.map(AgentReadiness.issuesOf(record, connections, integrations), AgentReadiness.readinessOf)

  /**
   * The agent by ID with its name while its membership lasts, and `CoreError.NotFound` once it
   * ended.
   */
  const requireActiveAgent = Effect.fnUntraced(function* (agentId: Agent.Id) {
    const found = yield* agentStore.get(agentId)
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "Agent", id: agentId })
    const member = yield* memberStore.get(found.value.memberId)
    if (Option.isNone(member) || member.value.status !== "active")
      return yield* new CoreError.NotFound({ resource: "Agent", id: agentId })
    return { record: found.value, name: member.value.name }
  })

  /** An agent the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermittedAgent = Effect.fnUntraced(function* (
    agentId: Agent.Id,
    permission: Permission.Definition<"Member">
  ) {
    const agent = yield* requireActiveAgent(agentId)
    const target = memberTarget(agent.record.memberId)
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(AgentPermissions.Read, target),
      Requirement.make(permission, target),
      () => new CoreError.NotFound({ resource: "Agent", id: agentId })
    )
    return agent
  })

  /** The agent as the actor sees it, including whether they may configure and direct it. */
  const viewForActor = Effect.fnUntraced(function* (record: Agent.Agent, name: Member.Name) {
    const [configurable = false, usable = false] = yield* authorization.permitted([
      Requirement.make(AgentPermissions.Configure, memberTarget(record.memberId)),
      Requirement.make(AgentPermissions.Use, memberTarget(record.memberId))
    ])
    const readiness = yield* readinessOf(record, yield* connectionStore.listActive)
    return Agent.view(record, name, readiness, { configurable, usable })
  })

  /**
   * Fails unless the actor may give an agent each connection `setup` names, reading and using it,
   * and an agent set up so can run. One on `Auto` may have no harness to choose yet, since a
   * connection that gives one can be added after it.
   */
  const checkSetup = Effect.fnUntraced(function* (setup: AgentReadiness.Setup) {
    const named = AgentReadiness.namedConnections(setup)
    // One grant resolution answers both permissions for every connection named.
    const permitted = yield* authorization.permitted(
      named.flatMap(({ connectionId }) => [
        Requirement.make(ConnectionPermissions.Read, connectionTarget(connectionId)),
        Requirement.make(ConnectionPermissions.Use, connectionTarget(connectionId))
      ])
    )
    const connections = yield* connectionStore.listActive
    for (const [index, { part, connectionId }] of named.entries()) {
      const [readable = false, usable = false] = permitted.slice(index * 2, index * 2 + 2)
      const active = connections.some((connection) => connection.id === connectionId)
      if (!readable || !usable || !active)
        return yield* new CoreError.Invalid({
          reason: new CoreError.ConnectionUnusable({ part, connectionId })
        })
    }
    const issues = (yield* AgentReadiness.issuesOf(setup, connections, integrations)).filter(
      (issue) => !Agent.Issue.isAnyOf(["NoHarness"])(issue)
    )
    if (Array.isReadonlyArrayNonEmpty(issues))
      return yield* new CoreError.Invalid({ reason: new CoreError.Incomplete({ issues }) })
  })

  /** The agents whose membership lasts, each with its name, in no particular order. */
  const activeAgents = Effect.gen(function* () {
    const records = yield* agentStore.list
    const members = yield* memberStore.getMany(records.map((record) => record.memberId))
    const membersById = new Map(members.map((member) => [member.id, member]))
    const active: Array<{ readonly record: Agent.Agent; readonly name: Member.Name }> = []
    for (const record of records) {
      const member = membersById.get(record.memberId)
      if (member?.status === "active") active.push({ record, name: member.name })
    }
    return active
  })

  /** Views by name, and by id among agents of one name. */
  const byName = (left: Agent.View, right: Agent.View) =>
    left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1)

  const list = Effect.gen(function* () {
    yield* authorization.require([])
    const agents = yield* activeAgents
    // One grant resolution answers the three permissions for every agent.
    const permitted = yield* authorization.permitted(
      agents.flatMap(({ record }) => [
        Requirement.make(AgentPermissions.Read, memberTarget(record.memberId)),
        Requirement.make(AgentPermissions.Configure, memberTarget(record.memberId)),
        Requirement.make(AgentPermissions.Use, memberTarget(record.memberId))
      ])
    )
    const connections = yield* connectionStore.listActive
    const views: Array<Agent.View> = []
    for (const [index, { record, name }] of agents.entries()) {
      const [readable = false, configurable = false, usable = false] = permitted.slice(index * 3, index * 3 + 3)
      if (!readable) continue
      const readiness = yield* readinessOf(record, connections)
      views.push(Agent.view(record, name, readiness, { configurable, usable }))
    }
    return views.toSorted(byName)
  }).pipe(Effect.withSpan("AgentService.list"), Operation.report)

  const get = Effect.fn("AgentService.get")(function* (agentId: Agent.Id) {
    const id = yield* Schema.decodeEffect(Agent.Id)(agentId)
    const { record, name } = yield* requirePermittedAgent(id, AgentPermissions.Read)
    return yield* viewForActor(record, name)
  }, Operation.report)

  const create = Effect.fn("AgentService.create")(
    function* (input: Agent.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Agent.CreateInput))(input)
      yield* authorization.require([Requirement.make(AgentPermissions.Create, { _tag: "Workspace", workspaceId })])
      yield* delegation.requireGrant(request.roleId)
      const actor = yield* Actor.Actor
      const agentId = Agent.Id.make(
        yield* Request.idFor(options.requestKey, ["agent.create", workspaceId, actor.memberId])
      )
      // A retry returns the agent its first attempt created, unless its membership ended since.
      if (options.requestKey !== undefined && Option.isSome(yield* agentStore.get(agentId))) {
        const { record, name } = yield* requireActiveAgent(agentId)
        return yield* viewForActor(record, name)
      }
      yield* checkSetup(request)
      const joinedAt = yield* DateTime.now
      const member = yield* memberCommand.add({
        identity: Identity.MemberReference.cases.Agent.make({ id: agentId }),
        name: request.name,
        roleId: request.roleId,
        joinedAt
      })
      const created: Agent.Agent = {
        id: agentId,
        workspaceId,
        memberId: member.id,
        instructions: request.instructions,
        harness: request.harness,
        model: request.model,
        sandbox: request.sandbox,
        createdBy: actor.memberId,
        createdAt: joinedAt
      }
      yield* journal.publish(AgentFacts.Created, created)
      return yield* viewForActor(created, request.name)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const sameConfiguration = Schema.toEquivalence(Schema.toType(Agent.Configuration))

  const configure = Effect.fn("AgentService.configure")(
    function* (input: Agent.ConfigureInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Agent.ConfigureInput))(input)
      const { record, name } = yield* requirePermittedAgent(request.agentId, AgentPermissions.Configure)
      const configuration: Agent.Configuration = {
        instructions: request.instructions,
        harness: request.harness,
        model: request.model,
        sandbox: request.sandbox
      }
      if (sameConfiguration(configuration, record)) return yield* viewForActor(record, name)
      yield* checkSetup(configuration)
      yield* journal.publish(AgentFacts.Configured, {
        workspaceId,
        agentId: record.id,
        memberId: record.memberId,
        instructions: configuration.instructions,
        harness: configuration.harness,
        model: configuration.model,
        sandbox: configuration.sandbox
      })
      return yield* viewForActor(Agent.change(record, configuration), name)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const rename = Effect.fn("AgentService.rename")(
    function* (input: Agent.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Agent.RenameInput))(input)
      const { record, name } = yield* requirePermittedAgent(request.agentId, AgentPermissions.Configure)
      if (name === request.name) return yield* viewForActor(record, name)
      if (name !== request.expectedName) return yield* new CoreError.Changed({ resource: "Agent", id: record.id })
      yield* journal.publish(MemberFacts.Renamed, {
        workspaceId,
        memberId: record.memberId,
        name: request.name
      })
      return yield* viewForActor(record, request.name)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  return AgentService.of({ list, get, create, configure, rename })
})

/**
 * Provide the agent operations over the stores, the member command, the host's integrations, the
 * journal, authorization, and delegation.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(AgentService, make())

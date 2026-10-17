/**
 * Whether an agent can run as it is set up: what keeps each connection it names from giving it its
 * part, as the integrations its host installs now find them, and which harnesses `Auto` has to
 * choose from. It reads and runs nothing: callers give it the workspace's connections.
 * `AgentService` reports it in each view and refuses a setup that cannot run, and `AgentQuery`
 * selects a turn's harness by it and fails when the agent cannot run.
 *
 * @since 0.1.0
 */

import type { Connection as ConnectionContract, Integration, Integrations } from "@amends-dev/connection"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Connection from "../connection/Connection.ts"
import * as Agent from "./Agent.ts"

/**
 * How an agent is set up, as far as whether it can run depends on it: a record's harness, model,
 * and sandbox, or a configuration's.
 *
 * @category models
 * @since 0.1.0
 */
export type Setup = Pick<Agent.Agent, "harness" | "model" | "sandbox">

/**
 * The workspace's connections that are not removed, which a setup names by id.
 *
 * @category models
 * @since 0.1.0
 */
export type Connections = ReadonlyArray<Connection.Connection>

/**
 * A connection a setup names, by the part it gives.
 *
 * @category models
 * @since 0.1.0
 */
export interface Named {
  readonly part: Agent.Part
  readonly connectionId: ConnectionContract.ConnectionId
}

/**
 * The connections `setup` names, by the part each gives, in order: its harness, when it names one
 * rather than `Auto`; its model; and its sandbox, when it has one.
 *
 * @category getters
 * @since 0.1.0
 */
export const namedConnections = (setup: Setup): ReadonlyArray<Named> => {
  const named: Array<Named> = []
  if (Agent.Harness.isAnyOf(["Connection"])(setup.harness)) {
    named.push({ part: "harness", connectionId: setup.harness.connectionId })
  }
  named.push({ part: "model", connectionId: setup.model.connectionId })
  if (setup.sandbox !== null) named.push({ part: "sandbox", connectionId: setup.sandbox.connectionId })
  return named
}

/**
 * What keeps `setup` from running over `connections`, as `integrations` find them: on `Auto`,
 * that no connection gives a harness it can run on, and then what keeps each connection it names
 * from giving its part, for its harness, then its model, then its sandbox.
 *
 * @category getters
 * @since 0.1.0
 */
export const issuesOf = Effect.fnUntraced(function* (
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"]
): Effect.fn.Return<ReadonlyArray<Agent.Issue>> {
  const named = yield* Effect.forEach(namedConnections(setup), ({ part, connectionId }) =>
    issueOf(part, connectionId, setup, connections, integrations)
  )
  const issues = named.filter((issue) => issue !== undefined)
  if (Agent.Harness.isAnyOf(["Connection"])(setup.harness)) return issues
  const choices = yield* harnessesToChoose(setup, connections, integrations)
  return choices.length === 0 ? [Agent.Issue.cases.NoHarness.make({}), ...issues] : issues
})

/**
 * Ready when nothing keeps an agent from running, and otherwise incomplete for `issues`.
 *
 * @category getters
 * @since 0.1.0
 */
export const readinessOf = (issues: ReadonlyArray<Agent.Issue>): Agent.Readiness =>
  Array.isReadonlyArrayNonEmpty(issues)
    ? Agent.Readiness.cases.Incomplete.make({ issues })
    : Agent.Readiness.cases.Ready.make({})

/**
 * What a connection is to an agent's setup: removed, of an integration its host no longer
 * installs, or installed.
 *
 * @category models
 * @since 0.1.0
 */
export type Resolved = Data.TaggedEnum<{
  Removed: {}
  Uninstalled: {}
  Installed: {
    readonly connection: ConnectionContract.Connection
    readonly integration: Integration.Integration
  }
}>

/**
 * @category constructors
 * @since 0.1.0
 */
export const Resolved = Data.taggedEnum<Resolved>()

/**
 * The connection `connectionId` among `connections`, with its integration when one is installed.
 *
 * @category getters
 * @since 0.1.0
 */
export const resolveConnection = Effect.fnUntraced(function* (
  connectionId: ConnectionContract.ConnectionId,
  connections: Connections,
  integrations: Integrations.Integrations["Service"]
): Effect.fn.Return<Resolved> {
  const record = connections.find((connection) => connection.id === connectionId)
  if (record === undefined) return Resolved.Removed()
  const integration = yield* Effect.option(integrations.find(record.integration))
  if (Option.isNone(integration)) return Resolved.Uninstalled()
  return Resolved.Installed({ connection: Connection.connectionOf(record), integration: integration.value })
})

/**
 * What keeps the connection `connectionId` from giving `part` to an agent set up as `setup`, or
 * nothing when it gives it: the connection was removed, its integration is no longer installed or
 * refuses it, or, for the harness, its agent works only in a sandbox and the agent has none.
 */
const issueOf = Effect.fnUntraced(function* (
  part: Agent.Part,
  connectionId: ConnectionContract.ConnectionId,
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"]
): Effect.fn.Return<Agent.Issue | undefined> {
  const resolved = yield* resolveConnection(connectionId, connections, integrations)
  if (!Resolved.$is("Installed")(resolved)) return { _tag: resolved._tag, part }
  const { integration, connection } = resolved
  const refusal = yield* refusalOf(part, integration, connection, setup)
  if (refusal !== undefined) return Agent.Issue.cases.Invalid.make({ part, description: refusal })
  if (part === "harness" && integration.requiresSandbox && setup.sandbox === null)
    return Agent.Issue.cases.SandboxRequired.make({})
  return undefined
})

/** The capability through which an integration gives each part. */
const capabilityOf = {
  harness: "harnesses",
  model: "models",
  sandbox: "sandboxes"
} as const satisfies Record<Agent.Part, Integration.Capability>

/**
 * Why `integration` does not give `connection` to an agent set up as `setup` for `part`, as the
 * integration describes it, or nothing when it does: the integration gives no such part, does not
 * take the connection's settings, or, for the model, does not offer it as the agent takes it.
 */
const refusalOf = Effect.fnUntraced(function* (
  part: Agent.Part,
  integration: Integration.Integration,
  connection: ConnectionContract.Connection,
  setup: Setup
): Effect.fn.Return<string | undefined> {
  const capability = capabilityOf[part]
  if (!integration.provides.includes(capability)) return `${integration.name} gives no ${capability}`
  const validated =
    part === "model"
      ? integration.validateModel(connection, {
          model: setup.model.id,
          ...(setup.model.effort === undefined ? {} : { effort: setup.model.effort })
        })
      : integration.validate(connection)
  return yield* Effect.match(validated, {
    onFailure: (error) => error.reason.message,
    onSuccess: () => undefined
  })
})

/** Connections as they were created, and by id among those created at once. */
const oldestFirst: Order.Order<Connection.Connection> = Order.combine(
  Order.mapInput(DateTime.Order, (record: Connection.Connection) => record.createdAt),
  Order.mapInput(Order.String, (record: Connection.Connection) => record.id)
)

/**
 * The connections whose harness an agent on `Auto`, set up as `setup`, can run on, oldest first:
 * those that would give it its harness with no issue.
 *
 * @category getters
 * @since 0.1.0
 */
export const harnessesToChoose = Effect.fnUntraced(function* (
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"]
) {
  const choices = yield* Effect.filter(connections, (record) =>
    Effect.map(issueOf("harness", record.id, setup, connections, integrations), (issue) => issue === undefined)
  )
  return Array.sort(choices, oldestFirst).map((record) => record.id)
})

/**
 * The harness an agent on `Auto` runs on, of the connections `harnessesToChoose` gives: the one
 * its last turn in a conversation ran on, `previous`, while it is still among them, so that the
 * conversation stays with one harness, and otherwise the first.
 *
 * @category getters
 * @since 0.1.0
 */
export const chooseHarness = (
  harnesses: ReadonlyArray<ConnectionContract.ConnectionId>,
  previous: ConnectionContract.ConnectionId | undefined
): ConnectionContract.ConnectionId | undefined =>
  previous !== undefined && harnesses.includes(previous) ? previous : harnesses[0]

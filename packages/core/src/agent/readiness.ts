/**
 * Whether an agent can run as it is set up: what keeps each connection it names from giving it its
 * part, as the integrations its host installs now find them, and which harnesses `Auto` has to
 * choose from. It reads and runs nothing: callers give it the workspace's connections.
 */
import type {
  Connection as ConnectionContract,
  Integration,
  Integrations,
} from "@amends-dev/connection";
import { Array, DateTime, Effect, Option, Order } from "effect";
import * as Connection from "../connection/connection.ts";
import type * as Agent from "./agent.ts";

/** How an agent is set up, as far as whether it can run depends on it. */
export type Setup = Pick<Agent.Record, "harness" | "model" | "sandbox">;

/** The workspace's connections that are not removed, which a setup names by id. */
export type Connections = ReadonlyArray<Connection.Record>;

/** A connection a setup names, by the part it gives. */
export interface Named {
  readonly part: Agent.Part;
  readonly connectionId: Connection.Id;
}

/**
 * The connections `setup` names, by the part each gives, in order: its harness, when it names one
 * rather than `Auto`; its model; and its sandbox, when it has one.
 */
export const namedConnections = (setup: Setup): ReadonlyArray<Named> => {
  const named: Array<Named> = [];
  if (setup.harness._tag === "Connection")
    named.push({ part: "harness", connectionId: setup.harness.connectionId });
  named.push({ part: "model", connectionId: setup.model.connectionId });
  if (setup.sandbox !== null)
    named.push({ part: "sandbox", connectionId: setup.sandbox.connectionId });
  return named;
};

/**
 * What keeps `setup` from running over `connections`, as `integrations` find them: on `Auto`,
 * that no connection gives a harness it can run on, and then what keeps each connection it names
 * from giving its part, for its harness, then its model, then its sandbox.
 */
export const issuesOf = Effect.fnUntraced(function* (
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"],
): Effect.fn.Return<ReadonlyArray<Agent.Issue>> {
  const named = yield* Effect.forEach(namedConnections(setup), ({ part, connectionId }) =>
    issueOf(part, connectionId, setup, connections, integrations),
  );
  const issues = named.filter((issue) => issue !== undefined);
  if (setup.harness._tag === "Connection") return issues;
  const choices = yield* harnessesToChoose(setup, connections, integrations);
  return choices.length === 0 ? [{ _tag: "NoHarness" }, ...issues] : issues;
});

/** Ready when nothing keeps an agent from running, and otherwise incomplete for `issues`. */
export const readinessOf = (issues: ReadonlyArray<Agent.Issue>): Agent.Readiness =>
  Array.isReadonlyArrayNonEmpty(issues) ? { _tag: "Incomplete", issues } : { _tag: "Ready" };

/**
 * What a connection is to an agent's setup: removed, of an integration its host no longer
 * installs, or installed.
 */
export type Resolved =
  | { readonly _tag: "Removed" }
  | { readonly _tag: "Uninstalled" }
  | {
      readonly _tag: "Installed";
      readonly connection: ConnectionContract.Connection;
      readonly integration: Integration.Integration;
    };

/** The connection `connectionId` among `connections`, with its integration when one is installed. */
export const resolveConnection = Effect.fnUntraced(function* (
  connectionId: Connection.Id,
  connections: Connections,
  integrations: Integrations.Integrations["Service"],
): Effect.fn.Return<Resolved> {
  const record = connections.find((connection) => connection.id === connectionId);
  if (record === undefined) return { _tag: "Removed" };
  const integration = yield* Effect.option(integrations.find(record.integration));
  if (Option.isNone(integration)) return { _tag: "Uninstalled" };
  return {
    _tag: "Installed",
    connection: Connection.connectionOf(record),
    integration: integration.value,
  };
});

/**
 * What keeps the connection `connectionId` from giving `part` to an agent set up as `setup`, or
 * nothing when it gives it: the connection was removed, its integration is no longer installed or
 * refuses it, or, for the harness, its agent works only in a sandbox and the agent has none.
 */
const issueOf = Effect.fnUntraced(function* (
  part: Agent.Part,
  connectionId: Connection.Id,
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"],
): Effect.fn.Return<Agent.Issue | undefined> {
  const resolved = yield* resolveConnection(connectionId, connections, integrations);
  if (resolved._tag !== "Installed") return { _tag: resolved._tag, part };
  const { integration, connection } = resolved;
  const refusal = yield* refusalOf(part, integration, connection, setup);
  if (refusal !== undefined) return { _tag: "Invalid", part, description: refusal };
  if (part === "harness" && integration.requiresSandbox && setup.sandbox === null)
    return { _tag: "SandboxRequired" };
  return undefined;
});

/** The capability through which an integration gives each part. */
const capabilityOf = {
  harness: "harnesses",
  model: "models",
  sandbox: "sandboxes",
} as const satisfies Record<Agent.Part, Integration.Capability>;

/**
 * Why `integration` does not give `connection` to an agent set up as `setup` for `part`, as the
 * integration describes it, or nothing when it does: the integration gives no such part, does not
 * take the connection's settings, or, for the model, does not offer it as the agent takes it.
 */
const refusalOf = Effect.fnUntraced(function* (
  part: Agent.Part,
  integration: Integration.Integration,
  connection: ConnectionContract.Connection,
  setup: Setup,
): Effect.fn.Return<string | undefined> {
  const capability = capabilityOf[part];
  if (!integration.provides.includes(capability))
    return `${integration.name} gives no ${capability}`;
  const validated =
    part === "model"
      ? integration.validateModel(connection, {
          model: setup.model.id,
          ...(setup.model.effort === undefined ? {} : { effort: setup.model.effort }),
        })
      : integration.validate(connection);
  return yield* Effect.match(validated, {
    onFailure: (error) => error.reason.description,
    onSuccess: () => undefined,
  });
});

/** Connections as they were created, and by id among those created at once. */
const oldestFirst: Order.Order<Connection.Record> = Order.combine(
  Order.mapInput(DateTime.Order, (record: Connection.Record) => record.createdAt),
  Order.mapInput(Order.String, (record: Connection.Record) => record.id),
);

/**
 * The connections whose harness an agent on `Auto`, set up as `setup`, can run on, oldest first:
 * those that would give it its harness with no issue.
 */
export const harnessesToChoose = Effect.fnUntraced(function* (
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"],
) {
  const choices = yield* Effect.filter(connections, (record) =>
    Effect.map(
      issueOf("harness", record.id, setup, connections, integrations),
      (issue) => issue === undefined,
    ),
  );
  return Array.sort(choices, oldestFirst).map((record) => record.id);
});

/**
 * The harness an agent on `Auto` runs on, of the connections `harnessesToChoose` gives: the one
 * its last turn in a conversation ran on, `previous`, while it is still among them, so that the
 * conversation stays with one harness, and otherwise the first.
 */
export const chooseHarness = (
  harnesses: ReadonlyArray<Connection.Id>,
  previous: Connection.Id | undefined,
): Connection.Id | undefined =>
  previous !== undefined && harnesses.includes(previous) ? previous : harnesses[0];

/**
 * Whether an agent can run as it is set up: what keeps each connection it names from giving it its
 * part, as the integrations its host installs now find them, and which harnesses `Auto` has to
 * choose from. It reads and runs nothing: callers give it the workspace's connections.
 */
import type {
  Connection as ConnectionContract,
  Integration,
  Integrations,
} from "@amends/connection";
import { Array, DateTime, Effect, Option } from "effect";
import { Connection } from "../connection/connection.ts";
import type { Agent } from "./agent.ts";

/** How an agent is set up, as far as whether it can run depends on it. */
export type Setup = Pick<Agent.Record, "harness" | "model" | "sandbox">;

/** The workspace's connections that are not removed, by id. */
export type Connections = ReadonlyMap<Connection.Id, Connection.Record>;

/** What a connection is to an agent's setup: removed, of an integration its host no longer installs, or installed. */
export type Resolved =
  | { readonly _tag: "Removed" }
  | { readonly _tag: "Uninstalled" }
  | {
      readonly _tag: "Installed";
      readonly connection: ConnectionContract.Connection;
      readonly integration: Integration.Integration;
    };

/**
 * What keeps `setup` from running over `connections`, as `integrations` find them: for its harness,
 * then its model, then its sandbox, in that order.
 */
export const issuesOf = Effect.fnUntraced(function* (
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"],
) {
  const issues: Array<Agent.Issue> = [];

  /** The integration of the connection for `part`, or nothing, recording why, when it cannot give it. */
  const integrationFor = Effect.fnUntraced(function* (
    part: Agent.Part,
    connectionId: Connection.Id,
  ) {
    const resolved = yield* resolveConnection(connectionId, connections, integrations);
    if (resolved._tag !== "Installed") {
      issues.push({ _tag: resolved._tag, part });
      return undefined;
    }
    const description = yield* refusalOf(part, resolved.integration, resolved.connection, setup);
    if (description === undefined) return resolved.integration;
    issues.push({ _tag: "Invalid", part, description });
    return undefined;
  });

  if (setup.harness._tag === "Connection") {
    const harness = yield* integrationFor("harness", setup.harness.connectionId);
    if (harness?.requiresSandbox === true && setup.sandbox === null)
      issues.push({ _tag: "SandboxRequired" });
  } else if ((yield* harnessesToChoose(setup, connections, integrations)).length === 0) {
    issues.push({ _tag: "NoHarness" });
  }
  yield* integrationFor("model", setup.model.connectionId);
  if (setup.sandbox !== null) yield* integrationFor("sandbox", setup.sandbox.connectionId);
  return issues;
});

/** Ready when nothing keeps an agent from running, and otherwise incomplete for `issues`. */
export const readinessOf = (issues: ReadonlyArray<Agent.Issue>): Agent.Readiness =>
  Array.isReadonlyArrayNonEmpty(issues) ? { _tag: "Incomplete", issues } : { _tag: "Ready" };

/** The connection `connectionId` among `connections`, with its integration when one is installed. */
export const resolveConnection = (
  connectionId: Connection.Id,
  connections: Connections,
  integrations: Integrations.Integrations["Service"],
): Effect.Effect<Resolved> => {
  const record = connections.get(connectionId);
  if (record === undefined) return Effect.succeed({ _tag: "Removed" });
  return Effect.map(Effect.option(integrations.find(record.integration)), (found) =>
    Option.match(found, {
      onNone: () => ({ _tag: "Uninstalled" }) as const,
      onSome: (integration) =>
        ({
          _tag: "Installed",
          connection: Connection.connectionOf(record),
          integration,
        }) as const,
    }),
  );
};

/**
 * Why `integration` does not give `connection` to an agent set up as `setup` for `part`, as the
 * integration describes it, or nothing when it does: the integration gives no such part, does not
 * take the connection's settings, or, for the model, does not offer it as the agent takes it.
 */
const refusalOf = (
  part: Agent.Part,
  integration: Integration.Integration,
  connection: ConnectionContract.Connection,
  setup: Setup,
): Effect.Effect<string | undefined> => {
  const capability = part === "harness" ? "harnesses" : part === "model" ? "models" : "sandboxes";
  if (!integration.provides.includes(capability))
    return Effect.succeed(`${integration.name} gives no ${capability}`);
  const validated =
    part === "model"
      ? integration.validateModel(connection, {
          model: setup.model.id,
          ...(setup.model.effort === undefined ? {} : { effort: setup.model.effort }),
        })
      : integration.validate(connection);
  return Effect.match(validated, {
    onFailure: (error) => error.reason.description,
    onSuccess: () => undefined,
  });
};

/**
 * The connections whose harness an agent on `Auto`, set up as `setup`, can run on, oldest first:
 * those whose integration gives harnesses and takes the connection, and whose agent has the
 * sandbox it needs.
 */
export const harnessesToChoose = Effect.fnUntraced(function* (
  setup: Setup,
  connections: Connections,
  integrations: Integrations.Integrations["Service"],
) {
  const chosen: Array<Connection.Record> = [];
  for (const record of connections.values()) {
    const resolved = yield* resolveConnection(record.id, connections, integrations);
    if (resolved._tag !== "Installed") continue;
    const { integration, connection } = resolved;
    if (!integration.provides.includes("harnesses")) continue;
    if (integration.requiresSandbox && setup.sandbox === null) continue;
    const taken = yield* Effect.match(integration.validate(connection), {
      onFailure: () => false,
      onSuccess: () => true,
    });
    if (taken) chosen.push(record);
  }
  return chosen
    .toSorted(
      (left, right) =>
        DateTime.Order(left.createdAt, right.createdAt) || (left.id < right.id ? -1 : 1),
    )
    .map((record) => record.id);
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

export * as AgentReadiness from "./readiness.ts";

import { Agent, ApiErrors, Connection, Workspace } from "@amends/api-http";
import { Cause, Effect, type Exit, Option, Schema } from "effect";
import type { ApiClient } from "./client.ts";
import { command } from "./failures.ts";
import { workspaceKey } from "./keys.ts";
import { refreshResult } from "./refresh.ts";
import { requestAtom } from "./request.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

export type { Agent };

const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const params = { workspaceId };
  const connections = [workspaceKey(workspaceId, "connections")];
  const environments = [workspaceKey(workspaceId, "environments")];
  return {
    /** The agents the reader may read, by name. */
    agents: client.query("agents", "list", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "agents")],
    }),
    /** The connections the reader may read, among them the model connections agents use. */
    connections: client.query("connections", "list", { params, reactivityKeys: connections }),
    /** The connection implementations, with the models each model provider suggests. */
    connectionImplementations: client.query("connections", "implementations", {
      params,
      reactivityKeys: connections,
    }),
    /** The environments the reader may read, for where agents start. */
    environments: client.query("environments", "list", { params, reactivityKeys: environments }),
    /** The harnesses and sandbox providers, which name each environment's runtime. */
    environmentImplementations: client.query("environments", "implementations", {
      params,
      reactivityKeys: environments,
    }),
    /** The workspace's roles and which the reader may give, for an agent's initial role. */
    settings: client.query("workspaces", "settings", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "settings")],
    }),
    /**
     * Each environment the reader may use, with whether it can run this model access. It follows
     * the agents, connections, and environments it is checked against.
     */
    environmentChoices: (selection: {
      readonly connectionId: Connection.Id;
      readonly model: string;
      readonly reasoning: string | undefined;
    }) =>
      client.query("agents", "environmentChoices", {
        params,
        query: {
          connectionId: selection.connectionId,
          model: selection.model,
          ...(selection.reasoning === undefined ? {} : { reasoning: selection.reasoning }),
        },
        reactivityKeys: [workspaceKey(workspaceId, "agents"), ...connections, ...environments],
      }),
  };
};
/**
 * The credential-scoped reads behind the Agents page. Agents keep their own invalidation key;
 * the connections, environments, and settings they name share those pages' reads. Undefined for
 * an invalid workspace ID.
 */
export const agentsReads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)),
  );
export type AgentsReads = ReturnType<typeof reads>;

/** What configuring replaces, and creating takes beside a name and role. */
export interface AgentConfiguration {
  readonly instructions: string;
  readonly model: {
    readonly connectionId: string;
    readonly model: string;
    readonly reasoning: string | null;
  };
  readonly environmentId: string;
}

export type AgentCommand =
  | { readonly kind: "refresh" }
  | {
      readonly kind: "create";
      readonly name: string;
      readonly roleId: string;
      readonly configuration: AgentConfiguration;
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | {
      readonly kind: "rename";
      readonly agentId: string;
      readonly name: string;
      readonly expectedName: string;
    }
  | {
      readonly kind: "configure";
      readonly agentId: string;
      readonly configuration: AgentConfiguration;
    }
  | { readonly kind: "remove"; readonly agentId: string };

/** A new creation attempt; retrying the same body reuses its key so it is not created twice. */
export const newAgentRequestKey = newWorkspaceRequestKey;

const mutate = Effect.fnUntraced(function* (
  client: ApiClient,
  workspaceId: Workspace.Id,
  change: Exclude<AgentCommand, { kind: "refresh" }>,
) {
  const api = yield* client;
  const agent = (agentId: string) =>
    Effect.map(command(Agent.Id)(agentId), (id) => ({ workspaceId, agentId: id }));
  switch (change.kind) {
    case "create":
      return yield* api.agents.create({
        params: { workspaceId },
        headers: { "idempotency-key": change.key },
        payload: yield* command(Agent.CreateInput)(
          Object.assign({ name: change.name, roleId: change.roleId }, change.configuration),
        ),
      });
    case "rename":
      return yield* api.agents.rename({
        params: yield* agent(change.agentId),
        payload: yield* command(
          Schema.Struct({
            name: Agent.RenameInput.fields.name,
            expectedName: Agent.RenameInput.fields.expectedName,
          }),
        )(change),
      });
    case "configure":
      return yield* api.agents.configure({
        params: yield* agent(change.agentId),
        payload: yield* command(Agent.Configuration)(change.configuration),
      });
    case "remove":
      return yield* api.agents.remove({ params: yield* agent(change.agentId) });
  }
});

/** What a completed command leaves behind: whether its result read back, and what it created. */
export interface Settled {
  readonly refreshed: Exit.Exit<void, unknown>;
  readonly created?: string;
}
/**
 * Run one command, then refresh the agents and what they name before answering, so a completed
 * write is followed by the state it produced. A refresh command only refreshes.
 */
export const agentsRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (input: AgentCommand, get) =>
    Effect.gen(function* () {
      const workspaceId = yield* command(Workspace.Id)(workspace);
      const outcome =
        input.kind === "refresh" ? undefined : yield* mutate(client, workspaceId, input);
      const created =
        input.kind === "create" && outcome !== undefined && "id" in outcome
          ? outcome.id
          : undefined;
      const current = reads(client, workspaceId);
      const refreshed = yield* Effect.exit(
        Effect.all(
          [
            refreshResult(get, current.agents),
            refreshResult(get, current.connections),
            refreshResult(get, current.environments),
          ],
          { concurrency: "unbounded", discard: true },
        ),
      );
      return { refreshed, created } satisfies Settled;
    }),
  );

/** Why the environment cannot run the model access, as the host names each reason. */
export type AgentReason = (typeof ApiErrors.AgentIncompatible.Type)["reasons"][number];
/**
 * Why an agent cannot run as saved: its model connection needs its key or is gone, its
 * environment is gone or needs setup, or the environment cannot run the model access at all.
 */
export type AgentIssue =
  | "connection-not-ready"
  | "connection-unavailable"
  | "environment-unavailable"
  | "environment-not-ready"
  | "no-model-inference"
  | "interface-unsupported"
  | "reasoning-unsupported";
/** An agent's readiness issue, or a compatibility reason, as a code the screens word. */
export const issueCode = (issue: Agent.Issue): AgentIssue => {
  switch (issue._tag) {
    case "ConnectionNotReady":
      return "connection-not-ready";
    case "ConnectionUnavailable":
      return "connection-unavailable";
    case "EnvironmentUnavailable":
      return "environment-unavailable";
    case "EnvironmentNotReady":
      return "environment-not-ready";
    case "NoModelInference":
      return "no-model-inference";
    case "InterfaceUnsupported":
      return "interface-unsupported";
    case "ReasoningUnsupported":
      return "reasoning-unsupported";
  }
};
/**
 * What an agent command was refused for, beyond a workspace failure: the connection or the
 * environment is no longer available to the reader, the environment cannot run the model access,
 * or the initial role is one the reader may not give.
 */
export type AgentProblem =
  | { readonly kind: "connection-unavailable" }
  | { readonly kind: "environment-unavailable" }
  | { readonly kind: "incompatible"; readonly reasons: readonly AgentIssue[] }
  | { readonly kind: "role-denied" };

/** The problems a failed command names, in the order the host reported them. */
export const agentProblems = (cause: Cause.Cause<unknown>): ReadonlyArray<AgentProblem> =>
  cause.reasons.flatMap((reason): ReadonlyArray<AgentProblem> => {
    if (!Cause.isFailReason(reason)) return [];
    const error = reason.error;
    if (Schema.is(ApiErrors.AgentConnectionUnavailable)(error))
      return [{ kind: "connection-unavailable" }];
    if (Schema.is(ApiErrors.AgentEnvironmentUnavailable)(error))
      return [{ kind: "environment-unavailable" }];
    if (Schema.is(ApiErrors.AgentIncompatible)(error))
      return [{ kind: "incompatible", reasons: error.reasons.map(issueCode) }];
    if (
      typeof error === "object" &&
      error !== null &&
      "_tag" in error &&
      error._tag === "Delegation.Denied" &&
      "reason" in error &&
      error.reason === "administrator-role"
    )
      return [{ kind: "role-denied" }];
    return [];
  });

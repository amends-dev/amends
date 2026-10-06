import { AgentV2, ApiErrors, ConnectionV2, Member, Workspace } from "@amends/api-http";
import type { AgentV2Issue, AgentsV2Failure, Effort } from "@amends/ui/screens/agents-v2";
import { Cause, Effect, Option, Schema } from "effect";
import type { Api, ApiClient } from "../api/client.ts";
import { command, workspaceFailure } from "../api/failures.ts";
import { workspaceKey } from "../api/keys.ts";
import { refreshResult } from "../api/refresh.ts";
import { connectionsV2Reads } from "../connections-v2/api.ts";
import { newWorkspaceRequestKey } from "../workspaces/api.ts";

export { AgentV2, ConnectionV2 };

const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const params = { workspaceId };
  const connections = connectionsV2Reads(client, workspaceId)!;
  return {
    /** The agents the reader may read, by name. */
    agents: client.query("agentsV2", "list", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "agents-v2")],
    }),
    /** The connections an agent's setup names, and the integrations that say what each gives. */
    connections: connections.connections,
    integrations: connections.integrations,
    /** The models a connection offers, as its integration lists them. */
    models: (connectionId: ConnectionV2.Id) =>
      client.query("connectionsV2", "models", {
        params: { workspaceId, connectionId },
        reactivityKeys: [workspaceKey(workspaceId, "connections-v2")],
      }),
    /** The workspace's roles and which the reader may give, for an agent's first role. */
    settings: client.query("workspaces", "settings", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "settings")],
    }),
  };
};
/**
 * The credential-scoped reads behind Agents v2: the agents under their own invalidation key, and
 * the connections v2 reads they share. Undefined for an invalid workspace ID.
 */
export const agentsV2Reads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)),
  );
export type AgentsV2Reads = ReturnType<typeof reads>;

/** How an agent is set up, as a change sends it. */
export interface SetupInput {
  readonly instructions: string;
  /** Undefined for Auto. */
  readonly harnessId: string | undefined;
  readonly model: {
    readonly connectionId: string;
    readonly id: string;
    readonly effort?: Effort;
  };
  /** Undefined for no sandbox. */
  readonly sandboxId: string | undefined;
}

export type AgentV2Command =
  | {
      readonly kind: "create";
      readonly name: string;
      readonly roleId: string;
      readonly setup: SetupInput;
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | { readonly kind: "configure"; readonly agentId: string; readonly setup: SetupInput }
  | {
      readonly kind: "rename";
      readonly agentId: string;
      readonly name: string;
      readonly expectedName: string;
    }
  | { readonly kind: "remove"; readonly agentId: string; readonly memberId: string };

/** A new creation attempt; retrying the same body reuses its key so it is not created twice. */
export const newAgentV2RequestKey = newWorkspaceRequestKey;

/** The setup as the contract takes it. */
const configurationOf = (setup: SetupInput) => ({
  instructions: setup.instructions,
  harness:
    setup.harnessId === undefined
      ? { _tag: "Auto" }
      : { _tag: "Connection", connectionId: setup.harnessId },
  model: {
    connectionId: setup.model.connectionId,
    id: setup.model.id,
    ...(setup.model.effort === undefined ? {} : { effort: setup.model.effort }),
  },
  sandbox: setup.sandboxId === undefined ? null : { connectionId: setup.sandboxId },
});

/**
 * Make one change to agents, answering with the ID of the agent it created, if any. An agent
 * leaves as any member does, so removing one ends its membership.
 */
export const changeAgentV2 = (workspace: string) => (api: Api, change: AgentV2Command) =>
  Effect.gen(function* () {
    const workspaceId = yield* command(Workspace.Id)(workspace);
    const agent = (agentId: string) =>
      Effect.map(command(AgentV2.Id)(agentId), (id) => ({ workspaceId, agentId: id }));
    switch (change.kind) {
      case "create": {
        const created = yield* api.agentsV2.create({
          params: { workspaceId },
          headers: { "idempotency-key": change.key },
          payload: yield* command(Schema.toType(AgentV2.CreateInput))({
            name: change.name,
            roleId: change.roleId,
            ...configurationOf(change.setup),
          }),
        });
        return created.id as string;
      }
      case "configure":
        yield* api.agentsV2.configure({
          params: yield* agent(change.agentId),
          payload: yield* command(Schema.toType(AgentV2.Configuration))(
            configurationOf(change.setup),
          ),
        });
        return undefined;
      case "rename":
        yield* api.agentsV2.rename({
          params: yield* agent(change.agentId),
          payload: yield* command(
            Schema.Struct({
              name: AgentV2.RenameInput.fields.name,
              expectedName: AgentV2.RenameInput.fields.expectedName,
            }),
          )(change),
        });
        return undefined;
      case "remove":
        yield* api.members.remove({
          params: { workspaceId, memberId: yield* command(Member.Id)(change.memberId) },
        });
        return undefined;
    }
  });

/** Reload the agents and the connections their setups name, as a change's result shows. */
export const reloadAgentsV2 = (reads: AgentsV2Reads) =>
  Effect.all(
    [
      refreshResult(reads.agents),
      refreshResult(reads.connections),
      refreshResult(reads.integrations),
    ],
    { concurrency: "unbounded", discard: true },
  );

/** Why an agent can't run, as the screens word it. */
export const issueOf = (issue: AgentV2.Issue): AgentV2Issue => {
  switch (issue._tag) {
    case "Removed":
      return { kind: "removed", part: issue.part };
    case "Uninstalled":
      return { kind: "uninstalled", part: issue.part };
    case "Invalid":
      return { kind: "invalid", part: issue.part, description: issue.description };
    case "SandboxRequired":
      return { kind: "sandbox-required" };
    case "NoHarness":
      return { kind: "no-harness" };
  }
};

const connectionUnavailable = Schema.is(ApiErrors.AgentV2ConnectionUnavailable);
const incomplete = Schema.is(ApiErrors.AgentV2Incomplete);
const delegation = Schema.is(Schema.Union(ApiErrors.delegation));

/**
 * Why a change failed, telling apart a connection the setup names that the reader can't use, a
 * setup that couldn't run, with why, and a role the reader may not give from the workspace's own
 * failures.
 */
export function agentsV2Failure(cause: Cause.Cause<unknown>): Omit<AgentsV2Failure, "action"> {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    if (connectionUnavailable(reason.error))
      return { error: "unavailable", part: reason.error.part };
    if (incomplete(reason.error))
      return { error: "incomplete", issues: reason.error.issues.map(issueOf) };
    if (delegation(reason.error)) return { error: "role-denied" };
  }
  return { error: workspaceFailure(cause) };
}

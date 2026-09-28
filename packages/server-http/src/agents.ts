import { Api, Principal } from "@amends/api-http";
import { AgentApplication } from "@amends/core/agent";
import type { Actor } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register agent handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "agents",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    /** Run an agent operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (agents: AgentApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(AgentApplication.Service, operation),
        ),
      );
    return handlers.handleAll({
      list: ({ params }) => asMember(params.workspaceId, (agents) => agents.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (agents) =>
          agents.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      environmentChoices: ({ params, query }) =>
        asMember(params.workspaceId, (agents) =>
          agents.environmentChoices({
            model: {
              connectionId: query.connectionId,
              model: query.model,
              reasoning: query.reasoning ?? null,
            },
          }),
        ),
      get: ({ params }) => asMember(params.workspaceId, (agents) => agents.get(params.agentId)),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (agents) =>
          agents.configure(Object.assign({ agentId: params.agentId }, payload)),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (agents) =>
          agents.rename({
            agentId: params.agentId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
      remove: ({ params }) =>
        asMember(params.workspaceId, (agents) => agents.remove(params.agentId)),
    });
  }),
);

export * as AgentsHandlers from "./agents.ts";

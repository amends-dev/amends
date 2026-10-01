import { Api, Principal } from "@amends/api-http";
import { AgentService } from "@amends/core/agent";
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
      operation: (agentService: AgentService.Interface) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(workspaceId, principal, Effect.flatMap(AgentService.Service, operation)),
      );
    return handlers.handleAll({
      list: ({ params }) => asMember(params.workspaceId, (agentService) => agentService.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (agentService) =>
          agentService.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      environmentChoices: ({ params, query }) =>
        asMember(params.workspaceId, (agentService) =>
          agentService.environmentChoices({
            model: {
              connectionId: query.connectionId,
              model: query.model,
              reasoning: query.reasoning ?? null,
            },
          }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (agentService) => agentService.get(params.agentId)),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (agentService) =>
          agentService.configure(Object.assign({ agentId: params.agentId }, payload)),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (agentService) =>
          agentService.rename({
            agentId: params.agentId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
      remove: ({ params }) =>
        asMember(params.workspaceId, (agentService) => agentService.remove(params.agentId)),
    });
  }),
);

export * as AgentsHandlers from "./agents.ts";

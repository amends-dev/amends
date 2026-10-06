import { Api, Principal } from "@amends/api-http";
import { AgentV2Service } from "@amends/core/agent-v2";
import type { Actor } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the handlers of agents v2, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "agentsV2",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    /** Run an agent operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (agentV2Service: AgentV2Service.Interface) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(workspaceId, principal, Effect.flatMap(AgentV2Service.Service, operation)),
      );
    return handlers.handleAll({
      list: ({ params }) => asMember(params.workspaceId, (agentV2Service) => agentV2Service.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (agentV2Service) =>
          agentV2Service.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (agentV2Service) => agentV2Service.get(params.agentId)),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (agentV2Service) =>
          agentV2Service.configure({
            agentId: params.agentId,
            instructions: payload.instructions,
            harness: payload.harness,
            model: payload.model,
            sandbox: payload.sandbox,
          }),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (agentV2Service) =>
          agentV2Service.rename({
            agentId: params.agentId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
    });
  }),
);

export * as AgentsV2Handlers from "./agents-v2.ts";

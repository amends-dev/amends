import { Api, Principal } from "@amends-dev/api-http";
import { AgentService } from "@amends-dev/core/agent";
import type { Actor } from "@amends-dev/core/identity";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the handlers of agents, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "agents",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    /** Run an agent operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (
        agentService: AgentService.AgentService["Service"],
      ) => Effect.Effect<A, E, Actor.Actor>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(AgentService.AgentService, operation),
        ),
      );
    return handlers.handleAll({
      list: ({ params }) => asMember(params.workspaceId, (agentService) => agentService.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (agentService) =>
          agentService.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (agentService) => agentService.get(params.agentId)),
      configure: ({ params, payload }) =>
        asMember(params.workspaceId, (agentService) =>
          agentService.configure({
            agentId: params.agentId,
            instructions: payload.instructions,
            harness: payload.harness,
            model: payload.model,
            sandbox: payload.sandbox,
          }),
        ),
      rename: ({ params, payload }) =>
        asMember(params.workspaceId, (agentService) =>
          agentService.rename({
            agentId: params.agentId,
            name: payload.name,
            expectedName: payload.expectedName,
          }),
        ),
    });
  }),
);

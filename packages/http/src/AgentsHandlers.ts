/**
 * Implements `AgentsGroup`. Each handler enters the workspace as the principal's membership through
 * `Gateway.asMember` and calls one `AgentService` operation, merging the path's agent ID, the body,
 * and the `Idempotency-Key` header into its input. `Routes` composes its `layer` with the other
 * groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { AgentService } from "@amends-dev/core/agent";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the handlers of agents, each entering the workspace as the request's principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "agents",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      list: ({ params }) =>
        asMember(
          params.workspaceId,
          AgentService.AgentService.use((agentService) => agentService.list),
        ),
      create: ({ params, headers, payload }) =>
        asMember(
          params.workspaceId,
          AgentService.AgentService.use((agentService) =>
            agentService.create(payload, { requestKey: headers["idempotency-key"] }),
          ),
        ),
      get: ({ params }) =>
        asMember(
          params.workspaceId,
          AgentService.AgentService.use((agentService) => agentService.get(params.agentId)),
        ),
      configure: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          AgentService.AgentService.use((agentService) =>
            agentService.configure({
              agentId: params.agentId,
              instructions: payload.instructions,
              harness: payload.harness,
              model: payload.model,
              sandbox: payload.sandbox,
            }),
          ),
        ),
      rename: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          AgentService.AgentService.use((agentService) =>
            agentService.rename({
              agentId: params.agentId,
              name: payload.name,
              expectedName: payload.expectedName,
            }),
          ),
        ),
    });
  }),
);

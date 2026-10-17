/**
 * Implements `AgentsGroup`. Each handler runs in the workspace `WorkspaceMember` entered as the
 * principal's membership, and calls one `AgentService` operation, merging the path's agent ID, the
 * body, and the `Idempotency-Key` header into its input. `Routes` composes its `layer` with the
 * other groups'.
 *
 * @since 0.1.0
 */

import { AgentService } from "@amends-dev/core/agent"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Api from "./Api.ts"

/**
 * Register the handlers of agents.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "agents", (handlers) =>
  handlers.handleAll({
    list: () => AgentService.AgentService.use((agentService) => agentService.list),
    create: ({ headers, payload }) =>
      AgentService.AgentService.use((agentService) =>
        agentService.create(payload, { requestKey: headers["idempotency-key"] })
      ),
    get: ({ params }) => AgentService.AgentService.use((agentService) => agentService.get(params.agentId)),
    configure: ({ params, payload }) =>
      AgentService.AgentService.use((agentService) =>
        agentService.configure({
          agentId: params.agentId,
          instructions: payload.instructions,
          harness: payload.harness,
          model: payload.model,
          sandbox: payload.sandbox
        })
      ),
    rename: ({ params, payload }) =>
      AgentService.AgentService.use((agentService) =>
        agentService.rename({
          agentId: params.agentId,
          name: payload.name,
          expectedName: payload.expectedName
        })
      )
  })
)

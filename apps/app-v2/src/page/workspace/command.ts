import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Api from "../../api.ts"
import { Message, WorkspaceDefinition } from "./definition.ts"

/** List the integrations the host installs, which the workspace's connections, agents, and channels read. */
export const LoadIntegrations = WorkspaceDefinition.command("LoadIntegrations", {
  args: { workspaceId: WorkspaceId.WorkspaceId },
  messages: [Message.ReceivedIntegrations, Message.FailedLoadIntegrations],
  handler: function* () {
    return ({ workspaceId }) =>
      Effect.gen(function* () {
        const client = yield* Api.asMember(workspaceId)
        return Message.ReceivedIntegrations({ integrations: yield* client.connections.integrations() })
      }).pipe(
        Effect.orElseSucceed(() =>
          Message.FailedLoadIntegrations({ error: "The host could not be reached. Try again." })
        )
      )
  }
})

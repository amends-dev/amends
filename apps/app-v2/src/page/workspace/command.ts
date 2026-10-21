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
        Effect.catchCause(() =>
          Effect.succeed(Message.FailedLoadIntegrations({ error: "The host could not be reached. Try again." }))
        )
      )
  }
})

/**
 * Ask the page, as a Message of its own, to ask the settings for the dialog that changes the person's own name. A fold
 * of Home's reports calls no operation of the settings: a fold that calls one of a binding no other fold calls tips
 * TS2589 at the page's `makeUpdate`, which an update branch calling it does not.
 */
export const RequestNameChange = WorkspaceDefinition.command("RequestNameChange", {
  args: {},
  messages: [Message.CompletedRequestNameChange],
  handler: function* () {
    return () => Effect.succeed(Message.CompletedRequestNameChange())
  }
})

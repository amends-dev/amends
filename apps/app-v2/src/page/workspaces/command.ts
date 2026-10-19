import * as Effect from "effect/Effect"
import * as Api from "../../api.ts"
import { Message, WorkspacesDefinition } from "./definition.ts"

/** List the workspaces the person belongs to. */
export const LoadWorkspaces = WorkspacesDefinition.command("LoadWorkspaces", {
  messages: [Message.SucceededLoadWorkspaces, Message.FailedLoadWorkspaces],
  handler: function* () {
    return () =>
      Effect.gen(function* () {
        const client = yield* Api.signedIn
        const listing = yield* client.me.workspaces()
        return Message.SucceededLoadWorkspaces({ memberships: listing.memberships })
      }).pipe(
        Effect.orElseSucceed(() => Message.FailedLoadWorkspaces({ error: "The host could not be reached. Try again." }))
      )
  }
})

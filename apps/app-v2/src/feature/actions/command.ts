import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { ActionsDefinition, Message } from "./definition.ts"

/** Forget a refused action, once the person has seen why. */
export const Dismiss = ActionsDefinition.command("Dismiss", {
  args: { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, key: Schema.String },
  messages: [Message.CompletedDismiss],
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ workspaceId, memberId, key }) =>
      stores
        .write(workspaceId, memberId, (store) => store.dismiss(key))
        .pipe(Effect.ignore, Effect.as(Message.CompletedDismiss()))
  }
})

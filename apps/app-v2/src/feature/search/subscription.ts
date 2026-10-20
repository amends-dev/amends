/** Where the person can jump to, read from their store as it changes, while the search is open. */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { Message, SearchDefinition } from "./definition.ts"

export const subscriptions = SearchDefinition.subscriptions((entry) => ({
  targets: entry(
    "ReadJumpTargets",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, isOpen: Schema.Boolean },
    {
      messages: [Message.ReceivedTargets, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, dialog }) => ({ workspaceId, memberId, isOpen: dialog.isOpen }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, isOpen }) =>
          isOpen
            ? stores
                .read(workspaceId, memberId, (store) =>
                  Stream.map(store.jumpTargets, (targets) => Message.ReceivedTargets({ targets }))
                )
                .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
            : Stream.empty
      }
    }
  )
}))

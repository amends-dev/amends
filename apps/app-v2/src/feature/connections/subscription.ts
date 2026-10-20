/**
 * The workspace's connections, the members who made them, and what the person may do, read from their store as they
 * change.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { ConnectionsDefinition, Message } from "./definition.ts"

export const subscriptions = ConnectionsDefinition.subscriptions((entry) => ({
  connections: entry(
    "ReadConnections",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, reads: Schema.Int },
    {
      messages: [Message.ReceivedConnections, Message.ReceivedMembers, Message.ReceivedGrants, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, reads }) => ({ workspaceId, memberId, reads }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.map(store.list("Connection", Store.workspacePlace), (connections) =>
                Message.ReceivedConnections({
                  connections: connections
                    .filter(({ record }) => record.value.status === "active")
                    .map(({ record, pending }) => ({ connection: record.value, pending }))
                })
              ).pipe(
                Stream.merge(Stream.map(store.members, (members) => Message.ReceivedMembers({ members }))),
                Stream.merge(Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants })))
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))

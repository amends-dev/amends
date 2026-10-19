/** The workspace's connections, and what the person may do, read from their store as they change. */

import { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { ConnectionsDefinition, Message } from "./definition.ts"

const workspace = ReplicaRecord.Place.cases.Workspace.make({})

export const subscriptions = ConnectionsDefinition.subscriptions((entry) => ({
  connections: entry(
    "ReadConnections",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [Message.ReceivedConnections, Message.ReceivedGrants, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.list("Connection", workspace), (connections) =>
                  Message.ReceivedConnections({
                    connections: connections
                      .filter(({ record }) => record.value.status === "active")
                      .map(({ record, pending }) => ({ connection: record.value, pending }))
                  })
                ),
                Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants }))
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))

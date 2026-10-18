/**
 * What a member's browser and the server exchange about the workspace's connections. `Actions` are
 * what the member does with a connection, which their browser applies at once and the server runs
 * as `ConnectionService` operations; creating one and replacing its key carry an API key, which
 * never enters an action, so they stay requests. `Changes` keep the connections in their replica
 * current.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { ReplicaRecord } from "@amends-dev/core/replica"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

/**
 * What a member does with a connection. Each action's primary key is the connection.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  .add({ tag: "ConnectionRenamed", primaryKey: ({ connectionId }) => connectionId, payload: Connection.RenameInput })
  .add({
    tag: "ConnectionConfigured",
    primaryKey: ({ connectionId }) => connectionId,
    payload: Connection.ConfigureInput
  })
  .add({
    tag: "ConnectionRemoved",
    primaryKey: ({ connectionId }) => connectionId,
    payload: Schema.Struct({ connectionId: ConnectionContract.ConnectionId })
  })

/**
 * The connections a replica holds, never their keys, each with whether the host can use it now,
 * which only the server can tell.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges(
    "Connection",
    ReplicaRecord.Connection,
    Schema.Struct({ id: ConnectionContract.ConnectionId }),
    ({ id }) => ({ id })
  )
)

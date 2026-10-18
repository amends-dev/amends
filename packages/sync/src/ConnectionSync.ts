/**
 * What a member does with the workspace's connections, as actions their browser writes: it applies
 * each at once, and the server runs it as a `ConnectionService` operation. Creating one and
 * replacing its key carry an API key, which never enters an action, so they stay requests.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

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

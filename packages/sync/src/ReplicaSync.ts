/**
 * What the server writes about a member's replica as a whole: `ReplicaReset`, after which the
 * browser drops every record its replica held, and the changes that follow carry everything the
 * member may see now. A replica starts with one, and starts over with one when the member's grants
 * change.
 *
 * @since 0.1.0
 */

import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/**
 * The replica's resets. Their primary key is the replica's, so compaction keeps the latest.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.add({
  tag: "ReplicaReset",
  primaryKey: () => "replica",
  payload: Schema.Struct({})
})

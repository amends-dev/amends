/**
 * What the server writes to a member's store: `ReplicaChanged`, the changes one commit makes to the
 * member's replica, whole, as core's `ReplicaChange.Batch`, so the browser applies a commit or none
 * of it. Its changes carry records as they are now, the keys of those that left the member's reach,
 * where a dropped group or thread takes everything in it along, a reset, which drops everything the
 * replica held before the records that follow it, and how the member's own actions ended, each
 * naming the action's entry by its ID. Each one's sequence in the store is its commit's position.
 *
 * @since 0.1.0
 */

import { ReplicaChange } from "@amends-dev/core/replica"
import * as EventGroup from "effect/eventlog/EventGroup"

/**
 * The changes the server writes. Each one's primary key is its commit's position, so no two are
 * ever compacted together.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.add({
  tag: "ReplicaChanged",
  primaryKey: ({ position }) => String(position),
  payload: ReplicaChange.Batch
})

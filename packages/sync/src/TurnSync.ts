/**
 * What a member's browser and the server exchange about agents' turns. `Actions` are what the
 * member does with a turn, which their browser applies at once and the server runs as
 * `TurnService` operations. `Changes` keep the turns in their replica current; a turn's log is
 * followed apart from the replica.
 *
 * @since 0.1.0
 */

import { ReplicaRecord } from "@amends-dev/core/replica"
import { TurnId } from "@amends-dev/core/turn"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

/**
 * What a member does with a turn. Each action's primary key is the turn.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  // Ask an active turn to stop: `TurnService.cancel`.
  .add({
    tag: "TurnCancelRequested",
    primaryKey: ({ turnId }) => turnId,
    payload: Schema.Struct({ turnId: TurnId.TurnId })
  })
  // Start the turn again after it failed or was cancelled: `TurnService.retry`.
  .add({ tag: "TurnRetried", primaryKey: ({ turnId }) => turnId, payload: Schema.Struct({ turnId: TurnId.TurnId }) })

/**
 * The turns a replica holds, without where each one's log begins, which only the server reads.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges("Turn", ReplicaRecord.Turn, Schema.Struct({ id: TurnId.TurnId }), ({ id }) => ({ id }))
)

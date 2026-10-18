/**
 * What a member does with agents' turns, as actions their browser writes: it applies each at once,
 * and the server runs it as a `TurnService` operation. A turn's log is followed apart from the
 * replica.
 *
 * @since 0.1.0
 */

import { TurnId } from "@amends-dev/core/turn"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

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

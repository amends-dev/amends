/**
 * Keeps the turn read model, `TurnStore`: each turn as it was created or retried, and where it
 * stands since, as its later facts in `TurnFacts` say.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Projection from "../journal/Projection.ts"
import * as Turn from "./Turn.ts"
import * as TurnFacts from "./TurnFacts.ts"
import * as TurnStore from "./TurnStore.ts"

/** Change the stored turn a fact names, as `changes` says of it as it stands. */
const update = Effect.fnUntraced(function* (turnId: Turn.Id, changes: (turn: Turn.Turn) => Partial<Turn.Turn>) {
  const turnStore = yield* TurnStore.TurnStore
  const found = yield* turnStore.get(turnId)
  if (Option.isNone(found)) return yield* Effect.die("A changed turn is missing")
  yield* turnStore.update(Turn.change(found.value, changes(found.value)))
})

/**
 * Inserts each created or retried turn, then changes the stored turn each later fact names: a
 * start takes a queued turn to `running` with its selection, and leaves one already asked to stop
 * as it is; a stop request marks it `cancelling` with the reason; and completion, failure, and
 * cancellation finish it with its reply, its failure, or why it stopped.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("turns", { version: 4 })
  .on(
    TurnFacts.Created,
    Effect.fn("TurnProjection.created")(function* ({ payload }) {
      const turnStore = yield* TurnStore.TurnStore
      const { notificationIds: _, ...record } = payload
      yield* turnStore.insert(record)
    })
  )
  .on(
    TurnFacts.Retried,
    Effect.fn("TurnProjection.retried")(function* ({ payload }) {
      const turnStore = yield* TurnStore.TurnStore
      yield* turnStore.insert(payload)
    })
  )
  .on(
    TurnFacts.Started,
    Effect.fn("TurnProjection.started")(function* ({ payload }) {
      yield* update(payload.turnId, (turn) => ({
        status: turn.status === "queued" ? "running" : turn.status,
        selection: payload.selection,
        startedAt: payload.startedAt
      }))
    })
  )
  .on(
    TurnFacts.CancelRequested,
    Effect.fn("TurnProjection.cancelRequested")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({ status: "cancelling", cancelReason: payload.reason }))
    })
  )
  .on(
    TurnFacts.Completed,
    Effect.fn("TurnProjection.completed")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({
        status: "completed",
        messageIds: payload.messageIds,
        finishedAt: payload.finishedAt
      }))
    })
  )
  .on(
    TurnFacts.Failed,
    Effect.fn("TurnProjection.failed")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({
        status: "failed",
        failure: payload.reason,
        finishedAt: payload.finishedAt
      }))
    })
  )
  .on(
    TurnFacts.Cancelled,
    Effect.fn("TurnProjection.cancelled")(function* ({ payload }) {
      yield* update(payload.turnId, () => ({
        status: "cancelled",
        cancelReason: payload.cancelReason,
        finishedAt: payload.finishedAt
      }))
    })
  )

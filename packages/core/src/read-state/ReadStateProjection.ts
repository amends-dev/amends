/**
 * Keeps the read-state read model, `ReadStateStore`, from the journal: each person's position in
 * the threads they read, and when they last read each group, at the time the fact records.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Projection from "../journal/Projection.ts"
import * as ReadStateFacts from "./ReadStateFacts.ts"
import * as ReadStateStore from "./ReadStateStore.ts"

/**
 * Advances each person's read state as they read; a position or time at or before the stored one
 * leaves it where it is.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("read-state", { version: 1 })
  .on(
    ReadStateFacts.ThreadRead,
    Effect.fn("ReadStateProjection.threadRead")(function* ({ payload }) {
      const readStateStore = yield* ReadStateStore.ReadStateStore
      yield* readStateStore.advanceThread(payload)
    })
  )
  .on(
    ReadStateFacts.GroupRead,
    Effect.fn("ReadStateProjection.groupRead")(function* ({ payload, provenance }) {
      const readStateStore = yield* ReadStateStore.ReadStateStore
      yield* readStateStore.advanceGroup(Object.assign({}, payload, { readAt: provenance.occurredAt }))
    })
  )

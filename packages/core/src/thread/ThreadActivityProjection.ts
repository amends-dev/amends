/**
 * Keeps the activity read model, `ThreadActivityStore`: a thread's timeline, each activity as it
 * was recorded. The thread and group read models keep their own latest activity from the same
 * fact.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Projection from "../journal/Projection.ts"
import * as ThreadActivityFacts from "./ThreadActivityFacts.ts"
import * as ThreadActivityStore from "./ThreadActivityStore.ts"

/**
 * Inserts each recorded activity. Its recipients are read by the notification projection, not
 * kept here.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("thread.activity", { version: 1 }).on(
  ThreadActivityFacts.Recorded,
  Effect.fn("ThreadActivityProjection.recorded")(function* ({ payload }) {
    const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore
    yield* threadActivityStore.insert(payload.activity)
  })
)

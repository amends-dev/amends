/**
 * The reads of turns that operations and the change feed share: whether a turn may run again,
 * which every view of it shows. Internal: not among `Core.Operations`.
 *
 * @since 0.1.0
 */

import type { StoreError } from "@amends-dev/log"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as ThreadParticipationStore from "../thread/ThreadParticipationStore.ts"
import * as Turn from "./Turn.ts"
import * as TurnStore from "./TurnStore.ts"

/**
 * The shared reads of turns.
 *
 * @category services
 * @since 0.1.0
 */
export class TurnQuery extends Context.Service<
  TurnQuery,
  {
    /**
     * Why the turn can't run again now: it is still active, it completed, a later turn of its agent
     * in its thread superseded it, or its agent no longer takes part there; undefined when it can.
     */
    readonly whyNotRetryable: (
      turn: Turn.Turn
    ) => Effect.Effect<Turn.NotRetryableReason | undefined, StoreError.StoreError>
  }
>()("@amends-dev/core/turn/TurnQuery") {}

/**
 * Builds the reads over the turn and participation stores.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const turnStore = yield* TurnStore.TurnStore
  const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore
  const whyNotRetryable = Effect.fn("TurnQuery.whyNotRetryable")(function* (turn: Turn.Turn) {
    if (Turn.active(turn.status)) return "active" as const
    if (turn.status === "completed") return "completed" as const
    if (Option.isSome(yield* turnStore.findActive(turn.memberId, turn.threadId))) return "superseded" as const
    const latest = yield* turnStore.findLatest(turn.memberId, turn.threadId)
    if (Option.isSome(latest) && latest.value.id !== turn.id) return "superseded" as const
    const participation = yield* threadParticipationStore.get(turn.participationId)
    if (Option.isNone(participation) || participation.value.status !== "active") return "departed" as const
    return undefined
  })
  return TurnQuery.of({ whyNotRetryable })
})

/**
 * `TurnQuery` from `make`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(TurnQuery, make)

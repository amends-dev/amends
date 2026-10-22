/** Turn order and retry eligibility from the thread’s current records. */

import { Turn, TurnStore } from "@amends-dev/core/turn"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Order from "effect/Order"
import type * as Pending from "../Pending.ts"
import type * as Replica from "../Replica.ts"

/** One of a thread's turns, and whether nothing but who may direct its agent keeps it from running again. */
export interface TurnView {
  readonly turn: Pending.Held<Replica.RecordOf<"Turn">>
  readonly retryOpen: boolean
}

const byCreated = Order.mapInput(
  DateTime.Order,
  ({ record }: Pending.Held<Replica.RecordOf<"Turn">>) => record.value.createdAt
)

/** Where `turn`'s agent stands on its thread, from the thread's turns and who takes part in it. */
const standingOf = (
  turn: Replica.RecordOf<"Turn">["value"],
  turns: ReadonlyArray<Replica.RecordOf<"Turn">["value"]>,
  participations: ReadonlyArray<Replica.RecordOf<"ThreadParticipation">["value"]>
): Turn.Standing => {
  const agents = turns.filter(({ memberId }) => memberId === turn.memberId)
  return {
    active: agents.some(({ status }) => Turn.active(status)),
    latest: TurnStore.latestOf(agents)?.id,
    participating: participations.some(({ id, status }) => id === turn.participationId && status === "active")
  }
}

/**
 * A thread's turns as the person sees them, oldest first, each with whether nothing but who may
 * direct its agent keeps it from running again, by where its agent stands among the thread's turns
 * and `participations`.
 */
export const deriveTurns = (
  turns: ReadonlyArray<Pending.Held<Replica.RecordOf<"Turn">>>,
  participations: ReadonlyArray<Replica.RecordOf<"ThreadParticipation">["value"]>
): ReadonlyArray<TurnView> => {
  const values = turns.map(({ record }) => record.value)
  return Array.sort(turns, byCreated).map((turn) => ({
    turn,
    retryOpen:
      Turn.whyNotRetryable(turn.record.value, standingOf(turn.record.value, values, participations)) === undefined
  }))
}

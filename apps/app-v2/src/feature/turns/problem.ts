/**
 * Why a stop or a retry did not go through, as the person reads it under the turn's row: the browser could not keep it,
 * the turn had finished or could not run again, they may not direct its agent, or the turn is gone.
 */

import { CoreError } from "@amends-dev/core/error"
import { TurnId } from "@amends-dev/core/turn"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Store from "../../store/Store.ts"

/**
 * Why a stop or a retry did not go through: the browser could not keep it (`stop-failed`, `retry-failed`), the turn had
 * already finished, is still running, already replied, was followed by a newer turn, or its agent no longer takes part
 * in the thread, the person may not direct its agent, or the turn is no longer there.
 */
export const TurnProblem = Schema.Literals([
  "stop-failed",
  "retry-failed",
  "finished",
  "still-running",
  "replied",
  "superseded",
  "departed",
  "denied",
  "gone"
])
export type TurnProblem = typeof TurnProblem.Type

/** A stop or retry of a turn that did not go through. */
export const Refusal = Schema.Struct({ turnId: TurnId.TurnId, problem: TurnProblem })
export type Refusal = typeof Refusal.Type

/** The problem with a turn's agent, `agent` by name, in words. */
export const problemText = (problem: TurnProblem, agent: string): string => {
  switch (problem) {
    case "stop-failed":
      return "Couldn't stop the turn. Try again."
    case "retry-failed":
      return "Couldn't start another attempt. Try again."
    case "finished":
      return "This turn has already finished."
    case "still-running":
      return "This turn is still running."
    case "replied":
      return "This turn already replied."
    case "superseded":
      return "A newer turn followed this one."
    case "departed":
      return `${agent} no longer takes part in this thread.`
    case "denied":
      return `You can't direct ${agent}.`
    case "gone":
      return "This turn is no longer available."
  }
}

const notRetryableProblem: Readonly<Record<CoreError.NotRetryable["reason"], TurnProblem>> = {
  active: "still-running",
  completed: "replied",
  superseded: "superseded",
  departed: "departed"
}

/** Why the server refused to stop a turn, as far as its refusal says. */
export const stopProblemOf = (rejection: CoreError.Rejection): TurnProblem => {
  if (Schema.is(CoreError.Denied)(rejection)) {
    return "denied"
  }

  if (Schema.is(CoreError.NotFound)(rejection)) {
    return "gone"
  }

  if (Schema.is(CoreError.Conflict)(rejection)) {
    return CoreError.ConflictReason.matchOrElse(
      rejection.reason,
      { TurnNotActive: () => "finished" as const },
      () => "stop-failed" as const
    )
  }

  return "stop-failed"
}

/** Why the server refused to retry a turn, as far as its refusal says. */
export const retryProblemOf = (rejection: CoreError.Rejection): TurnProblem => {
  if (Schema.is(CoreError.Denied)(rejection)) {
    return "denied"
  }

  if (Schema.is(CoreError.NotFound)(rejection)) {
    return "gone"
  }

  if (Schema.is(CoreError.Conflict)(rejection)) {
    return CoreError.ConflictReason.matchOrElse(
      rejection.reason,
      { NotRetryable: ({ reason }) => notRetryableProblem[reason] },
      () => "retry-failed" as const
    )
  }

  return "retry-failed"
}

const isStopOrRetryOf = Schema.is(Schema.Struct({ turnId: TurnId.TurnId }))

/** The turn a stop or a retry names, and which of the two it was. */
const attemptOf = (action: Store.ActionView): Option.Option<{ turnId: TurnId.TurnId; stops: boolean }> =>
  (action.tag === "TurnCancelRequested" || action.tag === "TurnRetried") && isStopOrRetryOf(action.payload)
    ? Option.some({ turnId: action.payload.turnId, stops: action.tag === "TurnCancelRequested" })
    : Option.none()

/**
 * The stops and retries the server refused, one for each turn: the latest the person made of that turn, which a later
 * one that is still on its way or was kept leaves unsaid.
 */
export const refusalsOf = (actions: ReadonlyArray<Store.ActionView>): ReadonlyArray<Refusal> => {
  const latest = new Map<TurnId.TurnId, Refusal | undefined>()

  for (const action of actions.toSorted((left, right) => (left.key < right.key ? -1 : 1))) {
    const attempt = attemptOf(action)

    if (Option.isSome(attempt)) {
      const { turnId, stops } = attempt.value
      latest.set(
        turnId,
        Option.match(action.rejection, {
          onNone: () => undefined,
          onSome: (rejection) => ({ turnId, problem: stops ? stopProblemOf(rejection) : retryProblemOf(rejection) })
        })
      )
    }
  }

  return [...latest.values()].filter((refusal) => refusal !== undefined)
}

/**
 * Stopping a turn and retrying it, each an action written to the person's store, and keeping its log at its end.
 */

import { TurnId } from "@amends-dev/core/turn"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { followEnd, scrollToEnd } from "../../conversationScroll.ts"
import * as Stores from "../../store/Stores.ts"
import { logListId, Message, TurnsDefinition } from "./definition.ts"

const outcomes = [Message.WroteAction, Message.FailedStop, Message.FailedRetry]

/** Ask the turn `turnId` to stop. */
export const StopTurn = TurnsDefinition.command("StopTurn", {
  args: { ...Stores.AsMember, turnId: TurnId.TurnId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ turnId, ...member }) =>
      Stores.writer(stores, Message.WroteAction(), () => Message.FailedStop({ turnId }))(member, (store) =>
        store.write("TurnCancelRequested", { turnId })
      )
  }
})

/** Retry the turn `turnId`, after it failed or stopped. */
export const RetryTurn = TurnsDefinition.command("RetryTurn", {
  args: { ...Stores.AsMember, turnId: TurnId.TurnId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ turnId, ...member }) =>
      Stores.writer(stores, Message.WroteAction(), () => Message.FailedRetry({ turnId }))(member, (store) =>
        store.write("TurnRetried", { turnId })
      )
  }
})

/**
 * Scroll the log of `turnId` to its end once it is drawn, so that it opens there and returns there when the person asks
 * for the latest.
 */
export const ScrollLogToEnd = TurnsDefinition.command("ScrollLogToEnd", {
  args: { turnId: TurnId.TurnId },
  messages: [Message.CompletedScrollLogToEnd],
  handler: function* () {
    return ({ turnId }) =>
      scrollToEnd(logListId(turnId), { unlessCurrent: false }).pipe(Effect.as(Message.CompletedScrollLogToEnd()))
  }
})

/**
 * Keep the log of `turnId` at its end after it grew, if the person was near its end, and say whether they were, so that
 * what grew out of their view is told to them.
 */
export const FollowLogEnd = TurnsDefinition.command("FollowLogEnd", {
  args: { turnId: TurnId.TurnId },
  messages: [Message.FollowedLogEnd, Message.LeftLogBehind],
  handler: function* () {
    return ({ turnId }) =>
      followEnd(logListId(turnId)).pipe(
        Effect.map((wasNearEnd) => (wasNearEnd ? Message.FollowedLogEnd() : Message.LeftLogBehind()))
      )
  }
})

export const EffectsLayer = Layer.mergeAll(StopTurn.layer, RetryTurn.layer, ScrollLogToEnd.layer, FollowLogEnd.layer)

/** Stopping a turn and retrying it, each an action written to the person's store. */

import { TurnId } from "@amends-dev/core/turn"
import * as Layer from "effect/Layer"
import * as Stores from "../../store/Stores.ts"
import { Message, TurnsDefinition } from "./definition.ts"

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

export const EffectsLayer = Layer.mergeAll(StopTurn.layer, RetryTurn.layer)

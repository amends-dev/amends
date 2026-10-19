/** Stopping a turn and running it again, each an action written to the person's store. */

import { TurnId } from "@amends-dev/core/turn"
import * as Layer from "effect/Layer"
import * as Stores from "../../store/Stores.ts"
import { Message, TurnsDefinition } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Ask the turn `turnId` to stop. */
export const StopTurn = TurnsDefinition.command("StopTurn", {
  args: { ...Stores.AsMember, turnId: TurnId.TurnId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ turnId, ...member }) => write(member, (store) => store.write("TurnCancelRequested", { turnId }))
  }
})

/** Run the turn `turnId` again, after it failed or stopped. */
export const RunTurnAgain = TurnsDefinition.command("RunTurnAgain", {
  args: { ...Stores.AsMember, turnId: TurnId.TurnId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ turnId, ...member }) => write(member, (store) => store.write("TurnRetried", { turnId }))
  }
})

export const EffectsLayer = Layer.mergeAll(StopTurn.layer, RunTurnAgain.layer)

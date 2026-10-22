/** The stop action and refusal message shared by turn rows and logs. */

import { Turn, type TurnId } from "@amends-dev/core/turn"
import { button } from "@amends-dev/design/control"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { TurnsViewBuilder } from "../composition.ts"
import { directs, Message, type Model, problemOf, type TurnItem } from "../definition.ts"
import { problemText } from "./wording.ts"

/**
 * Stop, named for the agent, for someone who may direct it while its turn is active; while the turn is stopping, a Stop
 * named "Stopping" that waits, whoever reads it.
 */
export const stopView = ({ turn }: TurnItem, agent: string, model: Model, h: TurnsViewBuilder): ReadonlyArray<Html> => {
  const isStopping = turn.status === "cancelling"

  return (directs(model, turn) && Turn.stoppable(turn.status)) || isStopping
    ? [
        button(h, "Stop", Message.ClickedStop({ turnId: turn.id }), {
          name: isStopping ? "Stopping" : `Stop ${agent}`,
          isDisabled: isStopping
        })
      ]
    : []
}

/** Why the last stop or retry of the turn `turnId` did not go through, in words, if it did not. */
export const problemView = (model: Model, turnId: TurnId.TurnId, agent: string): Option.Option<string> =>
  Option.map(problemOf(model, turnId), (problem) => problemText(problem, agent))

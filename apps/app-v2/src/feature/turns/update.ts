import { Turn, type TurnId } from "@amends-dev/core/turn"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { RunTurnAgain, StopTurn } from "./command.ts"
import { TurnsComposition } from "./composition.ts"
import { LogState, Message, type Model, type TurnItem, type TurnLog } from "./definition.ts"

/** The log as `logMessage` leaves it: its items as they stand once opened, each change in its place, and ended with its turn. */
const followLog = (log: TurnLog, logMessage: Turn.LogMessage): TurnLog =>
  Turn.LogMessage.match(logMessage, {
    Opened: ({ items }) => ({ ...log, items, state: LogState.Following() }),
    Changed: ({ changes }) => ({
      ...log,
      items: changes.reduce(
        (items, { index, item }) => [...items.slice(0, index), item, ...items.slice(index + 1)],
        log.items
      )
    }),
    Ended: () => ({ ...log, state: LogState.Ended() })
  })

/** The model with the log of `turnId` as `change` makes it, while the person follows that turn's, and no other. */
const atLog = (model: Model, turnId: TurnId.TurnId, change: (log: TurnLog) => TurnLog) =>
  modifyFields(model, { log: Option.map((log) => (log.turnId === turnId ? change(log) : log)) })

/** Whether the thread has the turn `turnId`, and `isAllowed` says an action may be written for it. */
const allows = (model: Model, turnId: TurnId.TurnId, isAllowed: (item: TurnItem) => boolean) =>
  model.turns.some((item) => item.turn.id === turnId && isAllowed(item))

export const update = TurnsComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  return Message.match(message, {
    ReceivedTurns: ({ turns }) => ({ model: modifyFields(model, { turns: () => turns }) }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    // A log the person no longer follows is passed over.
    ReceivedLog: ({ turnId, logMessage }) => ({
      model: atLog(model, turnId, (log) => followLog(log, logMessage))
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    FailedFollowLog: ({ turnId, error }) => ({
      model: atLog(model, turnId, (log) => modifyFields(log, { state: () => LogState.Failed({ error }) }))
    }),
    ClickedStop: ({ turnId }) => ({
      model,
      commands: allows(model, turnId, ({ turn }) => Turn.stoppable(turn.status))
        ? [StopTurn({ workspaceId, memberId, turnId })]
        : []
    }),
    ClickedRunAgain: ({ turnId }) => ({
      model,
      commands: allows(model, turnId, ({ retryOpen }) => retryOpen)
        ? [RunTurnAgain({ workspaceId, memberId, turnId })]
        : []
    }),
    // Following the log again, as after it failed, starts it anew.
    ClickedShowLog: ({ turnId }) => ({
      model: modifyFields(model, { log: () => Option.some({ turnId, items: [], state: LogState.Opening() }) })
    }),
    ClickedHideLog: () => ({ model: modifyFields(model, { log: () => Option.none() }) }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})

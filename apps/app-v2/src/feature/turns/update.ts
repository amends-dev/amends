import { Turn, type TurnId } from "@amends-dev/core/turn"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { entriesOf } from "./activity.ts"
import { FollowLogEnd, RetryTurn, ScrollLogToEnd, StopTurn } from "./command.ts"
import { TurnsComposition } from "./composition.ts"
import { findTurn, LogState, Message, type Model, OutMessage, type TurnItem, type TurnLog } from "./definition.ts"

/**
 * The log as `logMessage` leaves it: its items as they stand once opened, each change in its place, and ended with
 * its turn.
 */
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

/** The model with the log the person follows as `change` makes it. */
const atFollowedLog = (model: Model, change: (log: TurnLog) => TurnLog) =>
  modifyFields(model, { log: Option.map(change) })

/** Whether the person follows the log of `turnId`. */
const followsLogOf = (model: Model, turnId: TurnId.TurnId): boolean =>
  Option.exists(model.log, (log) => log.turnId === turnId)

/** How many entries the activity of the log the person follows lists, none while they follow none. */
const activityLength = (model: Model): number =>
  Option.match(
    Option.flatMap(model.log, ({ turnId, items }) =>
      Option.map(findTurn(model, turnId), (item) => entriesOf(item, items, model.turns))
    ),
    { onNone: () => 0, onSome: (entries) => entries.length }
  )

/**
 * `after`, with its log kept at its end when the person was near it, if what it lists grew since `before`: the activity
 * of a log grows with what it holds and with how its turn ends.
 */
const keepingLogAtEnd = (before: Model, after: Model) =>
  Option.match(after.log, {
    onNone: () => ({ model: after }),
    onSome: ({ turnId }) => ({
      model: after,
      commands: activityLength(after) > activityLength(before) ? [FollowLogEnd({ turnId })] : []
    })
  })

/** Whether the thread has the turn `turnId`, and `isAllowed` says an action may be written for it. */
const allows = (model: Model, turnId: TurnId.TurnId, isAllowed: (item: TurnItem) => boolean) =>
  model.turns.some((item) => item.turn.id === turnId && isAllowed(item))

/** The model without the stop or retry the browser could not keep, which the person tries again. */
const withoutUnkept = (model: Model) => modifyFields(model, { unkept: () => Option.none() })

/** The thread again, in place of the log, which the thread is told of so that it shows as the person left it. */
const returnToThread = (model: Model) => ({
  model: modifyFields(model, { log: () => Option.none() }),
  outMessage: OutMessage.ReturnedToThread()
})

export const update = TurnsComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  return Message.match(message, {
    ReceivedTurns: ({ turns }) => keepingLogAtEnd(model, modifyFields(model, { turns: () => turns })),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedConnections: ({ connections }) => ({ model: modifyFields(model, { connections: () => connections }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    ReceivedRefusals: ({ refusals }) => ({ model: modifyFields(model, { refused: () => refusals }) }),
    // A log the person no longer follows is passed over. One that opens is shown from its end.
    ReceivedLog: ({ turnId, logMessage }) =>
      Turn.LogMessage.isAnyOf(["Opened"])(logMessage)
        ? {
            model: atLog(model, turnId, (log) => followLog(log, logMessage)),
            commands: followsLogOf(model, turnId) ? [ScrollLogToEnd({ turnId })] : []
          }
        : keepingLogAtEnd(
            model,
            atLog(model, turnId, (log) => followLog(log, logMessage))
          ),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    FoundLogUnavailable: ({ turnId }) => ({
      model: atLog(model, turnId, (log) => modifyFields(log, { state: () => LogState.Unavailable() }))
    }),
    FailedFollowLog: ({ turnId, error }) => ({
      model: atLog(model, turnId, (log) => modifyFields(log, { state: () => LogState.Failed({ error }) }))
    }),
    ClickedStop: ({ turnId }) => ({
      model: withoutUnkept(model),
      commands: allows(model, turnId, ({ turn }) => Turn.stoppable(turn.status))
        ? [StopTurn({ workspaceId, memberId, turnId })]
        : []
    }),
    ClickedRetry: ({ turnId }) => ({
      model: withoutUnkept(model),
      commands: allows(model, turnId, ({ retryOpen }) => retryOpen)
        ? [RetryTurn({ workspaceId, memberId, turnId })]
        : []
    }),
    // Following the log again, as after it failed, starts it anew.
    ClickedViewLog: ({ turnId }) => ({
      model: modifyFields(model, {
        log: () => Option.some({ turnId, items: [], state: LogState.Opening(), hasNewActivity: false })
      })
    }),
    ClickedBackToThread: () => returnToThread(model),
    ClickedViewReply: () => returnToThread(model),
    ClickedCloseLog: () => ({ model, outMessage: OutMessage.ClosedLog() }),
    ClickedAgentSettings: ({ agentId }) => ({ model, outMessage: OutMessage.OpenedAgent({ agentId }) }),
    ClickedJumpToLatest: () =>
      Option.match(model.log, {
        onNone: () => ({ model }),
        onSome: ({ turnId }) => ({
          model: atFollowedLog(model, (log) => modifyFields(log, { hasNewActivity: () => false })),
          commands: [ScrollLogToEnd({ turnId })]
        })
      }),
    CompletedScrollLogToEnd: () => ({ model }),
    FollowedLogEnd: () => ({
      model: atFollowedLog(model, (log) => modifyFields(log, { hasNewActivity: () => false }))
    }),
    LeftLogBehind: () => ({
      model: atFollowedLog(model, (log) => modifyFields(log, { hasNewActivity: () => true }))
    }),
    WroteAction: () => ({ model }),
    FailedStop: ({ turnId }) => ({
      model: modifyFields(model, { unkept: () => Option.some({ turnId, problem: "stop-failed" as const }) })
    }),
    FailedRetry: ({ turnId }) => ({
      model: modifyFields(model, { unkept: () => Option.some({ turnId, problem: "retry-failed" as const }) })
    })
  })
})

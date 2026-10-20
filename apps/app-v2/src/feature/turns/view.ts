import { Turn, type TurnId } from "@amends-dev/core/turn"
import { button, buttonRow, hint, iconButton, notice } from "@amends-dev/design/control"
import { log, turnStatus } from "@amends-dev/design/details"
import { turnLog, turnRow } from "@amends-dev/design/message"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { initials, memberName } from "../../seen.ts"
import { TurnsComposition, type TurnsViewBuilder } from "./composition.ts"
import {
  directs,
  endingOf,
  LogState,
  Message,
  type Model,
  problemOf,
  stateOf,
  type TurnItem,
  type TurnLog
} from "./definition.ts"
import { problemText } from "./problem.ts"

/** Which turn a view shows: the one that took on the work, by its id. */
export type ViewInputs = Readonly<{ turnId: TurnId.TurnId }>

/** One item of a turn's log, as the person reads it. */
const logItemText = (item: Turn.LogItem) =>
  Turn.LogItem.match(item, {
    InputTaken: ({ messages }) => `Read ${messages} ${messages === 1 ? "message" : "messages"}`,
    Responded: ({ text, reply }) => (reply ? `Replied: ${text}` : text),
    Interrupted: ({ reason }) => `Stopped short: ${reason}`
  })

/** Where following a turn's log stands, when the person has something to read or to do about it. */
const logStateView = (turnLog: TurnLog, h: TurnsViewBuilder): ReadonlyArray<Html> =>
  LogState.match(turnLog.state, {
    Opening: () => [hint(h, "Opening the log…")],
    Following: () => (turnLog.items.length === 0 ? [hint(h, "Nothing written yet.")] : []),
    Ended: () => [hint(h, "The turn has ended.")],
    Failed: ({ error }) => [
      notice(h, Option.some(error)),
      buttonRow(h, [button(h, "Try again", Message.ClickedViewLog({ turnId: turnLog.turnId }), { variant: "quiet" })])
    ]
  })

/** A turn's log as the person follows it: what its agent was given, what it wrote, and where it stopped short. */
const logView = (turnLog: TurnLog, h: TurnsViewBuilder): ReadonlyArray<Html> => [
  ...(turnLog.items.length === 0 ? [] : [log(h, { label: "Log", items: turnLog.items.map(logItemText) })]),
  ...logStateView(turnLog, h)
]

/** The turn `turnId`, while the thread has it. */
const findTurn = (model: Model, turnId: TurnId.TurnId): Option.Option<TurnItem> =>
  Option.fromUndefinedOr(model.turns.find(({ turn }) => turn.id === turnId))

/** The log of the turn `turnId`, while the person follows that one's. */
const shownLog = (model: Model, turnId: TurnId.TurnId): Option.Option<TurnLog> =>
  Option.filter(model.log, (followed) => followed.turnId === turnId)

/**
 * Stop, named for the agent, for someone who may direct it while its turn is active; while the turn is stopping, a Stop
 * named "Stopping" that waits, whoever reads it.
 */
const stopView = ({ turn }: TurnItem, agent: string, model: Model, h: TurnsViewBuilder): ReadonlyArray<Html> => {
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

/**
 * An agent's turn where it took on the work: its agent and how it stands, View log, which shows the log under the row
 * and hides it, Stop while the turn is active and Retry when nothing but who may direct its agent keeps it from
 * running again, what it says once it ended, "Sending…" while a change to it is on its way, why a stop or a retry did
 * not go through, and the log.
 */
const rowView = (item: TurnItem, model: Model, h: TurnsViewBuilder): Html => {
  const { turn, pending, retryOpen } = item
  const agent = memberName(model.members, turn.memberId)
  const followedLog = shownLog(model, turn.id)

  return turnRow(h, {
    key: turn.id,
    label: `${agent}'s turn`,
    mark: initials(agent),
    name: agent,
    status: turnStatus(h, stateOf(turn)),
    actions: [
      button(
        h,
        "View log",
        Option.isNone(followedLog) ? Message.ClickedViewLog({ turnId: turn.id }) : Message.ClickedHideLog(),
        { variant: "quiet", isExpanded: Option.isSome(followedLog) }
      ),
      ...stopView(item, agent, model, h),
      ...(directs(model, turn) && retryOpen ? [button(h, "Retry", Message.ClickedRetry({ turnId: turn.id }))] : [])
    ],
    detail: pending ? "Sending…" : Option.getOrUndefined(endingOf(turn, agent)),
    problem: Option.getOrUndefined(Option.map(problemOf(model, turn.id), (problem) => problemText(problem, agent))),
    children: Option.match(followedLog, { onNone: () => [], onSome: (followed) => logView(followed, h) })
  })
}

/** The row of the turn that took on the work, or nothing for a turn the thread does not hold. */
export const view = TurnsComposition.makeView.withInputs<ViewInputs>((model, { turnId }, h) =>
  Option.match(findTurn(model, turnId), { onNone: () => h.empty, onSome: (item) => rowView(item, model, h) })
)

/**
 * View turn log, the action of the message the turn posted as its reply, in place of a row of the turn's own: pressed
 * while the log is followed, which hides it.
 */
export const replyActionView = TurnsComposition.makeView.withInputs<ViewInputs>((model, { turnId }, h) => {
  const isShown = Option.isSome(shownLog(model, turnId))

  return iconButton(
    h,
    {
      icon: "list",
      label: "View turn log",
      onClick: isShown ? Message.ClickedHideLog() : Message.ClickedViewLog({ turnId })
    },
    { isPressed: isShown }
  )
})

/** The log of the turn that posted a reply, under that message, while it is followed. */
export const replyLogView = TurnsComposition.makeView.withInputs<ViewInputs>((model, { turnId }, h) =>
  Option.match(Option.product(findTurn(model, turnId), shownLog(model, turnId)), {
    onNone: () => h.empty,
    onSome: ([{ turn }, followed]) =>
      turnLog(h, {
        key: `${turn.id}-log`,
        label: `${memberName(model.members, turn.memberId)}'s turn log`,
        children: logView(followed, h)
      })
  })
)

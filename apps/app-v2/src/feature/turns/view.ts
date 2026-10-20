import { Turn } from "@amends-dev/core/turn"
import { button, buttonRow, hint, notice, sending } from "@amends-dev/design/control"
import { type BadgeTone, badge, entry, entryList, log } from "@amends-dev/design/details"
import type { LogoMotion } from "@amends-dev/design/logo"
import { paneSection } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { initials, memberName, turnStatusLabel } from "../../seen.ts"
import { TurnsComposition, type TurnsViewBuilder } from "./composition.ts"
import { directs, LogState, Message, type Model, type TurnItem, type TurnLog } from "./definition.ts"

/** How a turn stands, as the badge that says so is toned: in flight is cautious, well over is success. */
const turnStatusTone: Readonly<Record<Turn.Status, BadgeTone>> = {
  queued: "neutral",
  running: "caution",
  cancelling: "caution",
  completed: "success",
  failed: "danger",
  cancelled: "neutral"
}

/**
 * How the logo moves in the badge of a turn that is under way, as apps/ui moves it: the thread drawn through while it
 * waits, the stitches lit while it runs, the patch tugged while it stops. A turn that has ended shows no logo.
 */
const turnStatusMotion: Readonly<Record<Turn.Status, Option.Option<LogoMotion>>> = {
  queued: Option.some("thread"),
  running: Option.some("working"),
  cancelling: Option.some("tug"),
  completed: Option.none(),
  failed: Option.none(),
  cancelled: Option.none()
}

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
      buttonRow(h, [button(h, "Try again", Message.ClickedShowLog({ turnId: turnLog.turnId }), { variant: "quiet" })])
    ]
  })

/** A turn's log as the person follows it: what its agent was given, what it wrote, and where it stopped short. */
const logView = (turnLog: TurnLog, h: TurnsViewBuilder): ReadonlyArray<Html> => [
  ...(turnLog.items.length === 0 ? [] : [log(h, { label: "Log", items: turnLog.items.map(logItemText) })]),
  ...logStateView(turnLog, h)
]

/**
 * A turn: its agent and how it stands, who ran it again, why it failed; for a person who may direct
 * its agent, stopping it while it runs and running it again when nothing else keeps it from running
 * again; and its log.
 */
const turnView = ({ turn, pending, retryOpen }: TurnItem, model: Model, h: TurnsViewBuilder): Html => {
  const mayDirect = directs(model, turn)
  const agent = memberName(model.members, turn.memberId)
  const shownLog = Option.filter(model.log, ({ turnId }) => turnId === turn.id)

  return entry(h, {
    key: turn.id,
    mark: initials(agent),
    title: agent,
    trailing: [
      badge(h, {
        label: turnStatusLabel[turn.status],
        tone: turnStatusTone[turn.status],
        ...Option.match(turnStatusMotion[turn.status], { onNone: () => ({}), onSome: (motion) => ({ motion }) })
      }),
      turn.retry === null ? h.empty : hint(h, `run again by ${memberName(model.members, turn.retry.by)}`),
      sending(h, pending)
    ],
    children: [
      notice(h, Option.fromNullOr(turn.failure)),
      buttonRow(h, [
        mayDirect && Turn.stoppable(turn.status)
          ? button(h, "Stop", Message.ClickedStop({ turnId: turn.id }), { variant: "quiet" })
          : h.empty,
        mayDirect && retryOpen
          ? button(h, "Run again", Message.ClickedRunAgain({ turnId: turn.id }), { variant: "quiet" })
          : h.empty,
        Option.isNone(shownLog)
          ? button(h, "Show log", Message.ClickedShowLog({ turnId: turn.id }), { variant: "quiet" })
          : button(h, "Hide log", Message.ClickedHideLog(), { variant: "quiet" })
      ]),
      ...Option.match(shownLog, { onNone: () => [], onSome: (turnLog) => logView(turnLog, h) })
    ]
  })
}

/** The thread's turns, oldest first: each agent's work on what was asked of it there. */
export const view = TurnsComposition.makeView((model, h) =>
  model.turns.length === 0
    ? notice(h, model.notice)
    : paneSection(h, {
        title: "Turns",
        children: [
          notice(h, model.notice),
          entryList(h, {
            label: "Turns",
            children: model.turns.map((item) => turnView(item, model, h))
          })
        ]
      })
)

import { Turn } from "@amends-dev/core/turn"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, errorView, sending } from "../../controls.ts"
import { memberName, turnStatusLabel } from "../../seen.ts"
import { TurnsComposition, type TurnsViewBuilder } from "./composition.ts"
import { directs, LogState, Message, type Model, type TurnItem, type TurnLog } from "./definition.ts"

/** One item of a turn's log, as the person reads it. */
const logItemText = (item: Turn.LogItem) =>
  Turn.LogItem.match(item, {
    InputTaken: ({ messages }) => `Read ${messages} ${messages === 1 ? "message" : "messages"}`,
    Responded: ({ text, reply }) => (reply ? `Replied: ${text}` : text),
    Interrupted: ({ reason }) => `Stopped short: ${reason}`
  })

/** A turn's log as the person follows it: what its agent was given, what it wrote, and where it stopped short. */
const logView = (log: TurnLog, h: TurnsViewBuilder): Html =>
  h.section(
    [h.AriaLabel("Log")],
    [
      h.ol(
        [],
        log.items.map((item) => h.li([], [logItemText(item)]))
      ),
      LogState.match(log.state, {
        Opening: () => h.p([], ["Opening the log…"]),
        Following: () => h.empty,
        Ended: () => h.p([], ["The turn has ended."]),
        Failed: ({ error }) =>
          h.div(
            [h.Role("alert")],
            [h.p([], [error]), button(h, "Try again", Message.ClickedShowLog({ turnId: log.turnId }))]
          )
      })
    ]
  )

/**
 * A turn: its agent and how it stands, who ran it again, why it failed; for a person who may direct
 * its agent, stopping it while it runs and running it again when nothing else keeps it from running
 * again; and its log.
 */
const turnView = ({ turn, pending, retryOpen }: TurnItem, model: Model, h: TurnsViewBuilder): Html => {
  const mayDirect = directs(model, turn)
  return h.keyed("li")(
    turn.id,
    [],
    [
      h.p(
        [],
        [
          h.strong([], [memberName(model.members, turn.memberId)]),
          ` · ${turnStatusLabel[turn.status]}`,
          turn.retry === null ? h.empty : h.span([], [` · run again by ${memberName(model.members, turn.retry.by)}`]),
          sending(pending, h)
        ]
      ),
      turn.failure === null ? h.empty : h.p([], [turn.failure]),
      mayDirect && Turn.stoppable(turn.status) ? button(h, "Stop", Message.ClickedStop({ turnId: turn.id })) : h.empty,
      mayDirect && retryOpen ? button(h, "Run again", Message.ClickedRunAgain({ turnId: turn.id })) : h.empty,
      Option.match(
        Option.filter(model.log, ({ turnId }) => turnId === turn.id),
        {
          onNone: () => button(h, "Show log", Message.ClickedShowLog({ turnId: turn.id })),
          onSome: (log) => h.div([], [button(h, "Hide log", Message.ClickedHideLog()), logView(log, h)])
        }
      )
    ]
  )
}

/** The thread's turns, oldest first: each agent's work on what was asked of it there. */
export const view = TurnsComposition.makeView((model, h) =>
  model.turns.length === 0
    ? errorView(model.notice, h)
    : h.section(
        [h.AriaLabel("Turns")],
        [
          h.p([], [h.strong([], ["Turns"])]),
          errorView(model.notice, h),
          h.ol(
            [],
            model.turns.map((item) => turnView(item, model, h))
          )
        ]
      )
)

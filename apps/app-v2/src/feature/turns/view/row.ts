/** A turn’s row in the conversation and the action beside its reply. */

import type { TurnId } from "@amends-dev/core/turn"
import { button, iconButton, lineButton } from "@amends-dev/design/control"
import { turnStatus } from "@amends-dev/design/details"
import { turnRow } from "@amends-dev/design/message"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberName } from "../../../data/members.ts"
import { initials } from "../../../view/members.ts"
import { TurnsBlock } from "../block.ts"
import type { TurnsViewBuilder } from "../composition.ts"
import { directs, findTurn, Message, type Model, type TurnItem } from "../definition.ts"
import { stopView, problemView } from "./controls.ts"
import { endingOf, stateOf } from "./wording.ts"

/** Which turn a view shows: the one that took on the work, by its id. */
export type ViewInputs = Readonly<{ turnId: TurnId.TurnId }>

/**
 * An agent's turn where it took on the work: its agent and how it stands, View log, which shows the log in the side
 * pane, Stop while the turn is active and Retry when nothing but who may direct its agent keeps it from running again,
 * what it says once it ended, with Agent settings after why it failed, "Sending…" while a change to it is on its way,
 * and why a stop or a retry did not go through.
 */
const rowView = (item: TurnItem, model: Model, h: TurnsViewBuilder): Html => {
  const { turn, pending, retryOpen } = item
  const agent = memberName(model.members, turn.memberId)

  return turnRow(h, {
    key: turn.id,
    label: `${agent}’s turn`,
    mark: initials(agent),
    name: agent,
    status: turnStatus(h, stateOf(turn)),
    actions: [
      button(h, "View log", Message.ClickedViewLog({ turnId: turn.id }), { variant: "quiet" }),
      ...stopView(item, agent, model, h),
      ...(directs(model, turn) && retryOpen ? [button(h, "Retry", Message.ClickedRetry({ turnId: turn.id }))] : [])
    ],
    detail: pending ? "Sending…" : Option.getOrUndefined(endingOf(turn, agent)),
    detailAction:
      turn.status === "failed" && !pending
        ? lineButton(h, "Agent settings", Message.ClickedAgentSettings({ agentId: turn.agentId }))
        : undefined,
    problem: Option.getOrUndefined(problemView(model, turn.id, agent))
  })
}

/** The row of the turn that took on the work, or nothing for a turn the thread does not hold. */
export const view = TurnsBlock.makeView.withInputs<ViewInputs>((model, { turnId }, h) =>
  Option.match(findTurn(model, turnId), { onNone: () => h.empty, onSome: (item) => rowView(item, model, h) })
)

/** View turn log, the action of the message the turn posted as its reply, in place of a row of the turn's own. */
export const replyActionView = TurnsBlock.makeView.withInputs<ViewInputs>((_model, { turnId }, h) =>
  iconButton(h, { icon: "list", label: "View turn log", onClick: Message.ClickedViewLog({ turnId }) })
)

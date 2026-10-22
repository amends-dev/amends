import type { ReplicaRecord } from "@amends-dev/core/replica"
import { Turn, type TurnId } from "@amends-dev/core/turn"
import { button, iconButton, lineButton, loadingLine } from "@amends-dev/design/control"
import { turnStatus } from "@amends-dev/design/details"
import { activityMark } from "@amends-dev/design/mark"
import { turnRow } from "@amends-dev/design/message"
import { pane, paneBack, paneClose, paneEmpty } from "@amends-dev/design/pane"
import {
  turnLogActivity,
  turnLogCard,
  turnLogColumn,
  turnLogEntry,
  turnLogFooter,
  turnLogProblem,
  turnLogResponse,
  turnLogSummary
} from "@amends-dev/design/turnLog"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberName } from "../../data/members.ts"
import { initials } from "../../view/members.ts"
import { fullTimeOf, timeOf } from "../../view/time.ts"
import { TurnsBlock } from "./block.ts"
import type { TurnsViewBuilder } from "./composition.ts"
import {
  directs,
  findTurn,
  LogState,
  logListId,
  Message,
  type Model,
  problemOf,
  type TurnItem,
  type TurnLog
} from "./definition.ts"
import { endingOf, stateOf, Entry, entriesOf, Footer, footerOf, summaryOf, wordsOf } from "./log.ts"
import { problemText } from "./problem.ts"

/** Which turn a view shows: the one that took on the work, by its id. */
export type ViewInputs = Readonly<{ turnId: TurnId.TurnId }>

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

/** Why the last stop or retry of the turn `turnId` did not go through, in words, if it did not. */
const problemView = (model: Model, turnId: TurnId.TurnId, agent: string): Option.Option<string> =>
  Option.map(problemOf(model, turnId), (problem) => problemText(problem, agent))

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

/** One entry of a turn's activity: a response the agent recorded as a card, any other as a line with its time. */
const entryView = (entry: Entry, index: number, agent: string, h: TurnsViewBuilder): Html => {
  const { title, text } = wordsOf(entry, agent)
  const key = `${entry._tag}-${index}`

  return Entry.isAnyOf(["Response"])(entry)
    ? turnLogResponse(h, {
        key,
        title,
        label: "Complete",
        text: entry.text,
        note: entry.isPosted ? "This response was posted to the thread." : "Not posted to the thread."
      })
    : turnLogEntry(h, {
        key,
        title,
        time: timeOf(entry.at),
        dateTime: DateTime.formatIso(entry.at),
        timeTitle: fullTimeOf(entry.at),
        text
      })
}

/**
 * The cards under the activity of a turn: that it waits to start, and, for a turn that failed, that its agent's setup
 * is to be reviewed, with the way to its settings.
 */
const cardViews = (turn: ReplicaRecord.Turn, h: TurnsViewBuilder): ReadonlyArray<Html> => [
  ...(turn.status === "queued"
    ? [
        turnLogCard(h, {
          title: "Queued",
          mark: activityMark(h, "thread"),
          note: "Waiting to start. There is no output yet."
        })
      ]
    : []),
  ...(turn.status === "failed"
    ? [
        turnLogCard(h, {
          title: "Review the agent’s setup",
          tone: "caution",
          note: "Fix what stopped this turn before starting another attempt.",
          action: button(h, "Agent settings", Message.ClickedAgentSettings({ agentId: turn.agentId }))
        })
      ]
    : [])
]

/**
 * What the log of the turn `item` says once it is read: what the turn ran on, its activity, what waits or needs fixing,
 * and why a stop or retry did not go through.
 */
const contentView = (
  item: TurnItem,
  turnLog: TurnLog,
  agent: string,
  where: string,
  model: Model,
  h: TurnsViewBuilder
): Html => {
  const { turn } = item

  return turnLogColumn(h, [
    turnLogSummary(h, summaryOf(turn, stateOf(turn), where, model.connections)),
    turnLogActivity(h, {
      id: logListId(turn.id),
      label: "Activity",
      children: entriesOf(item, turnLog.items, model.turns).map((entry, index) => entryView(entry, index, agent, h))
    }),
    ...cardViews(turn, h),
    ...Option.toArray(Option.map(problemView(model, turn.id, agent), (text) => turnLogProblem(h, text)))
  ])
}

/** The line at the foot of the log that fits how the turn stands, and what the person may do. */
const footerView = (item: TurnItem, turnLog: TurnLog, model: Model, h: TurnsViewBuilder): Html => {
  const { turn } = item
  const footer = footerOf(stateOf(turn), {
    hasNewActivity: turnLog.hasNewActivity,
    canRetry: directs(model, turn) && item.retryOpen,
    hasReply: turn.messageIds.length > 0
  })

  return Footer.match(footer, {
    FollowingLive: () => turnLogFooter(h, { mark: "following", text: "Following live" }),
    NewActivity: () =>
      turnLogFooter(h, {
        action: button(h, "New activity · Jump to latest", Message.ClickedJumpToLatest(), { wide: true })
      }),
    RetryTurn: () =>
      turnLogFooter(h, {
        action: button(h, "Retry turn", Message.ClickedRetry({ turnId: turn.id })),
        text: "Previous log stays available."
      }),
    ViewReply: () =>
      turnLogFooter(h, { action: button(h, "View reply in thread", Message.ClickedViewReply(), { wide: true }) }),
    Waiting: () => turnLogFooter(h, { mark: "waiting", text: "Waiting for activity" }),
    Finished: () => turnLogFooter(h, { text: "This turn has finished." })
  })
}

/** What the pane says in place of a log that is out of reach. */
const unavailableView = (h: TurnsViewBuilder): Html =>
  paneEmpty(h, {
    art: "held-back",
    title: "This turn log isn’t available",
    copy: "It may be in a thread you can no longer open."
  })

/**
 * The turn log as the side pane's body and footer: while its log is being read a line says so, one out of reach or
 * that could not be read says so with the way to try again, and once it is read, its content and the footer that fits.
 */
const bodyAndFooter = (
  item: Option.Option<TurnItem>,
  turnLog: TurnLog,
  agent: string,
  where: string,
  model: Model,
  h: TurnsViewBuilder
): Readonly<{ body: Html; footer: Html | undefined }> =>
  Option.match(item, {
    onNone: () => ({ body: unavailableView(h), footer: undefined }),
    onSome: (turnItem) => {
      const read = () => ({
        body: contentView(turnItem, turnLog, agent, where, model, h),
        footer: footerView(turnItem, turnLog, model, h)
      })

      return LogState.match(turnLog.state, {
        Opening: () => ({ body: loadingLine(h, "Loading the turn log…"), footer: undefined }),
        Unavailable: () => ({ body: unavailableView(h), footer: undefined }),
        Failed: ({ error }) => ({
          body: paneEmpty(h, {
            art: "came-apart",
            title: "Can’t load this turn log",
            copy: error,
            action: button(h, "Try again", Message.ClickedViewLog({ turnId: turnLog.turnId }))
          }),
          footer: undefined
        }),
        Following: read,
        Ended: read
      })
    }
  })

/** Where the turn log is, such as "Thread in #general", for its summary. */
export type LogPaneInputs = Readonly<{ where: string }>

/**
 * The log of the turn the person follows as the side pane, in place of the thread, as `apps/ui` has it: Turn log, with
 * Back to thread, which returns to the thread, Stop while the turn can be stopped, and Close turn log, which leaves the
 * thread too, and, under the title, the agent and how its turn stands. Nothing while the person follows no log.
 */
export const logPaneView = TurnsBlock.makeView.withInputs<LogPaneInputs>((model, { where }, h) =>
  Option.match(model.log, {
    onNone: () => h.empty,
    onSome: (turnLog) => {
      const item = findTurn(model, turnLog.turnId)
      const agent = Option.match(item, {
        onNone: () => "The agent",
        onSome: ({ turn }) => memberName(model.members, turn.memberId)
      })
      const { body, footer } = bodyAndFooter(item, turnLog, agent, where, model, h)

      return pane(h, {
        variant: "side",
        label: "Turn log",
        header: {
          title: "Turn log",
          leading: paneBack(h, Message.ClickedBackToThread(), "Back to thread", { isAlways: true }),
          actions: [
            ...Option.match(item, { onNone: () => [], onSome: (turnItem) => stopView(turnItem, agent, model, h) }),
            paneClose(h, Message.ClickedCloseLog(), "Close turn log")
          ],
          ...Option.match(item, {
            onNone: () => ({}),
            onSome: ({ turn }) => ({ subtitle: [h.span([], [agent]), turnStatus(h, stateOf(turn))] })
          })
        },
        body: [body],
        followsEnd: true,
        ...(footer === undefined ? {} : { footer: [footer] })
      })
    }
  })
)

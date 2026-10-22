/** The pane that follows a turn’s log. */

import type { ReplicaRecord } from "@amends-dev/core/replica"
import { button, loadingLine } from "@amends-dev/design/control"
import { turnStatus } from "@amends-dev/design/details"
import { activityMark } from "@amends-dev/design/mark"
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
import { memberName } from "../../../data/members.ts"
import { fullTimeOf, timeOf } from "../../../view/time.ts"
import { Entry, entriesOf } from "../activity.ts"
import { TurnsBlock } from "../block.ts"
import type { TurnsViewBuilder } from "../composition.ts"
import {
  directs,
  findTurn,
  LogState,
  logListId,
  Message,
  type Model,
  type TurnItem,
  type TurnLog
} from "../definition.ts"
import { stopView, problemView } from "./controls.ts"
import { stateOf, Footer, footerOf, summaryOf, wordsOf } from "./wording.ts"

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

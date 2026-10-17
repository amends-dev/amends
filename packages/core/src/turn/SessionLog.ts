/**
 * An agent's session log in a thread: the record of its conversation there, one log of the
 * workspace's store for each participation, which its turns write as they run. It holds what the
 * agent was told and each step it took, each with the turn it belongs to; how a turn ended is the
 * turn's record's to say. A run appends to it alone, outside every commit, so its writes wait only
 * for the log's other writers. `SessionLogs` opens a participation's log, and the agent's session
 * resumes with the conversation rebuilt from it.
 *
 * @since 0.1.0
 */

import { Session, StreamPart } from "@amends-dev/harness"
import { Codec, Entry as LogEntry, Log } from "@amends-dev/log"
import * as Prompt from "effect/ai/Prompt"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { constVoid } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as ThreadMessageId from "../thread/ThreadMessageId.ts"
import type * as ThreadParticipationId from "../thread/ThreadParticipationId.ts"
import * as Turn from "./Turn.ts"
import * as TurnId from "./TurnId.ts"

/**
 * An entry of a session log: the conversation the agent joined, or, each naming its turn, what the
 * agent was prompted with, that a run started the turn, a step the agent finished, or that a run
 * stopped short.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Entry = Schema.TaggedUnion({
  /** The agent joined the thread under way, and its session started with the conversation so far. */
  Joined: { conversation: Schema.Array(Prompt.Message) },
  /** A turn prompted the agent with `prompt`, which tells it `messages` of the thread's messages. */
  Prompted: {
    turnId: TurnId.TurnId,
    prompt: Prompt.UserMessage,
    messages: Schema.Int
  },
  /**
   * A run of the turn started it from its prompt on the harness's agent `agent`, setting aside the
   * steps of any earlier run, with what continues the turn once the run is gone, when the agent
   * gives that: what `Session.UnfinishedTurn` takes as `agentState`. A run that continues the turn
   * starts none.
   */
  Started: {
    turnId: TurnId.TurnId,
    agent: Schema.String,
    agentState: Schema.optionalKey(Schema.Json)
  },
  /** A step of the turn finished, its parts added up. `id` names it, as its drafts do. */
  Step: { turnId: TurnId.TurnId, id: Schema.NonEmptyString, step: StreamPart.Step },
  /**
   * The turn's run stopped before the turn ended. The next run continues the turn from the steps
   * it finished when the agent still has it, and otherwise starts it again from its prompt.
   */
  Interrupted: { turnId: TurnId.TurnId, reason: Schema.NonEmptyString }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Entry = typeof Entry.Type

/**
 * The ID of a participation's session log among the workspace's logs.
 *
 * @category constructors
 * @since 0.1.0
 */
export const logIdOf = (participationId: ThreadParticipationId.ThreadParticipationId): LogEntry.LogId =>
  LogEntry.LogId.make(`session/${participationId}`)

/**
 * Each participation's session log, as a typed log of the workspace's store: what a turn's job
 * writes and what readers following a turn read. It opens session logs alone, so the jobs given it
 * reach no other log.
 *
 * @category services
 * @since 0.1.0
 */
export class SessionLogs extends Context.Service<
  SessionLogs,
  {
    /** The participation's session log; opening it touches no storage. */
    readonly open: (participationId: ThreadParticipationId.ThreadParticipationId) => Log.Handle<typeof Entry>
  }
>()("@amends-dev/core/turn/SessionLog/SessionLogs") {}

/**
 * How a session log stores its entries: as JSON, since what an agent was told and did holds Effect
 * AI's prompts and parts, whose unions the binary format cannot lay out.
 */
const storageCodec = Codec.makeEntryCodec(Entry, Codec.makeJsonForSchema(Entry))

/**
 * Provide `SessionLogs` over the workspace's `Log.Log`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  SessionLogs,
  Effect.map(Log.Log, (logs) =>
    SessionLogs.of({
      open: (participationId) => logs.open({ id: logIdOf(participationId), schema: Entry, storageCodec })
    })
  )
)

/**
 * Whether an entry is one of the turn's; the conversation joined belongs to none.
 *
 * @category predicates
 * @since 0.1.0
 */
export const isOfTurn =
  (turnId: TurnId.TurnId) =>
  (entry: Entry): boolean =>
    !Entry.isAnyOf(["Joined"])(entry) && entry.turnId === turnId

/**
 * The conversation a log records, as the agent's session resumes with it: the conversation it
 * joined, then each turn's prompt and the steps since the turn last started from it, since a run
 * that starts the turn again sets aside the steps of the runs before, and one that continues the
 * turn keeps them. A step that compacted the conversation leaves its summary in place of what came
 * before.
 *
 * @category getters
 * @since 0.1.0
 */
export const historyOf = (entries: ReadonlyArray<Entry>): Prompt.Prompt =>
  entries.reduce(
    // `turnStart` is the conversation the latest turn starts from: up to its prompt.
    ({ conversation, turnStart }, entry) =>
      Entry.match(entry, {
        Joined: (joined) => ({
          conversation: Prompt.concat(conversation, Prompt.fromMessages(joined.conversation)),
          turnStart
        }),
        Prompted: ({ prompt }) => {
          const prompted = Prompt.concat(conversation, Prompt.fromMessages([prompt]))
          return { conversation: prompted, turnStart: prompted }
        },
        Started: () => ({ conversation: turnStart, turnStart }),
        Step: ({ step }) => ({ conversation: Session.recordStep(conversation, step), turnStart }),
        Interrupted: () => ({ conversation, turnStart })
      }),
    { conversation: Prompt.empty, turnStart: Prompt.empty }
  ).conversation

/** A step's text, as the parts it wrote it in, joined. */
const textOf = (step: StreamPart.Step) =>
  step.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")

/**
 * What a turn answers, from its entries: the text of the last step that has any parts since the
 * turn last started, as harness answers a turn. Empty when that step wrote nothing.
 *
 * @category getters
 * @since 0.1.0
 */
export const answerOf = (entries: ReadonlyArray<Entry>): string =>
  entries.reduce(
    (answer, entry) =>
      Entry.match(entry, {
        Joined: () => answer,
        Prompted: () => "",
        Started: () => "",
        Step: ({ step }) => (step.parts.length > 0 ? textOf(step) : answer),
        Interrupted: () => answer
      }),
    ""
  )

/**
 * Reads a turn's entries from its participation's log as they come: `add` each page of batches in
 * order, which takes the batches past `position`, the turn's entries among them, `end` once the
 * turn ended, with the reply it posted, and `items` says what they show.
 *
 * @category models
 * @since 0.1.0
 */
export interface Reader {
  readonly add: (batches: ReadonlyArray<Log.Batch<Entry>>) => void
  readonly end: (messageIds: ReadonlyArray<ThreadMessageId.ThreadMessageId>) => void
  /** The position of the latest batch the reader took, the turn's or another's; None before any. */
  readonly position: () => Option.Option<LogEntry.Position>
  readonly items: () => ReadonlyArray<Turn.LogItem>
}

/**
 * Reads the turn's entries past `after`, the batch its log begins after, as its readers see them:
 * the prompt as the messages it took in, each step that wrote text as a response, and each run that
 * stopped short. The response the turn posted is its reply, once the turn ends; steps that only
 * called tools show nothing yet.
 *
 * @category constructors
 * @since 0.1.0
 */
export const reader = (turnId: TurnId.TurnId, after: Option.Option<LogEntry.Position>): Reader => {
  const ofTurn = isOfTurn(turnId)
  const items: Array<Turn.LogItem> = []
  let position = after
  /** Where the latest run's last response sits among the items. */
  let lastResponse: number | undefined
  const add: Reader["add"] = (batches) => {
    for (const batch of batches) {
      if (Option.isSome(position) && batch.position <= position.value) continue
      position = Option.some(batch.position)
      for (const entry of batch.entries) if (ofTurn(entry.payload)) addEntry(entry)
    }
  }
  const addEntry = ({ payload: entry, recordedAt: at }: Log.Entry<Entry>) =>
    Entry.match(entry, {
      Joined: constVoid,
      Started: constVoid,
      Prompted: ({ messages }) => {
        lastResponse = undefined
        items.push(Turn.LogItem.cases.InputTaken.make({ at, messages }))
      },
      Step: ({ id, step }) => {
        const text = textOf(step)
        if (text === "") return
        lastResponse = items.length
        items.push(
          Turn.LogItem.cases.Responded.make({
            at,
            responseId: id,
            text,
            parts: step.parts.flatMap((part, index) => (part.type === "text" ? [index] : [])),
            reply: false
          })
        )
      },
      Interrupted: ({ reason }) => {
        lastResponse = undefined
        items.push(Turn.LogItem.cases.Interrupted.make({ at, reason, retryable: true }))
      }
    })
  const end: Reader["end"] = (messageIds) => {
    if (messageIds.length === 0 || lastResponse === undefined) return
    const response = items[lastResponse]
    if (response !== undefined && Turn.LogItem.isAnyOf(["Responded"])(response)) {
      items[lastResponse] = { ...response, reply: true }
    }
  }
  return { add, end, position: () => position, items: () => [...items] }
}

const sameItem = Schema.toEquivalence(Turn.LogItem)

/**
 * The items of `now` that `before` did not have as they are, each at its index: what a reader
 * following the log is sent as `Turn.LogChange`s.
 *
 * @category getters
 * @since 0.1.0
 */
export const changesSince = (
  before: ReadonlyArray<Turn.LogItem>,
  now: ReadonlyArray<Turn.LogItem>
): ReadonlyArray<Turn.LogChange> =>
  now.flatMap((item, index) => {
    const had = before[index]
    return had !== undefined && sameItem(had, item) ? [] : [{ index, item }]
  })

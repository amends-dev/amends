/**
 * The turn runner runs one agent's turns in one thread, for its turn job, one at a time: it takes
 * the work that waits into a turn and starts it through the workspace, runs it on the agent's
 * harness while it writes the participation's session log and shows readers what each step is
 * writing, and ends it through the workspace. A turn asked to stop is stopped where it runs.
 *
 * What a run does with each part the agent streams is one decision, `advance`: from the run's
 * `Progress` so far and the part, the progress after it, the entries to append to the log, and the
 * drafts to show. The run's loop performs it, part by part, and keeps the latest progress for the
 * turn's end to read. `TurnJob`'s worker makes a runner for each job with `make`.
 *
 * @since 0.1.0
 */

import type * as Core from "@amends-dev/core"
import { SessionLog, type SessionStateStore, type Turn, type TurnJobs, TurnExecution } from "@amends-dev/core/turn"
import { Gateway } from "@amends-dev/gateway"
import { Agent, type Session, StreamPart } from "@amends-dev/harness"
import * as Array from "effect/Array"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Ref from "effect/Ref"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Stream from "effect/Stream"
import * as SessionLogWriter from "./internal/session-log-writer.ts"
import * as TurnAgent from "./internal/turn-agent.ts"

/** The least time between two drafts of a step's text, in milliseconds. */
const draftInterval = 100

/**
 * How a run of a turn came out, which decides how the turn ends: closed with its answer, failed, or
 * confirmed stopped.
 *
 * @category models
 * @since 0.1.0
 */
export type Outcome = Data.TaggedEnum<{
  /** The agent finished the turn, whose answer is the text of its last step. */
  Answered: {}
  /** The agent could not run the turn, or reported that it failed, for `reason`. */
  Failed: { readonly reason: string }
  /** The turn was asked to stop, and was. */
  Stopped: {}
}>

/**
 * Makes and matches `Outcome`s: `Outcome.Answered()`, `Outcome.Failed({ reason })`,
 * `Outcome.Stopped()`, and `Outcome.$match`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const Outcome = Data.taggedEnum<Outcome>()

/**
 * A run of the job failed before its turn ended; the turn it ran, if it accepted one, is still
 * active.
 *
 * @category errors
 * @since 0.1.0
 */
export class RunFailed extends Data.TaggedError("TurnRunner.RunFailed")<{
  readonly turnId: Turn.Id | undefined
  readonly cause: unknown
}> {}

/**
 * The drafts of the response `responseId`: the text each text part of `step` has past what
 * `shown` holds, by the part's position. `advance` shows them as the step grows.
 *
 * @category utils
 * @since 0.1.0
 */
export const newDrafts = (
  responseId: string,
  step: StreamPart.Step,
  shown: ReadonlyMap<number, number>
): ReadonlyArray<Turn.Draft> =>
  step.parts.flatMap((part, index) => {
    if (part.type !== "text") return []
    const offset = shown.get(index) ?? 0
    return part.text.length > offset ? [{ responseId, part: index, offset, text: part.text.slice(offset) }] : []
  })

/** An error an agent reported, as the reason its turn failed. */
const describeError = (error: unknown): string => {
  if (typeof error === "string" && error !== "") return error
  if (Predicate.hasProperty(error, "message") && typeof error.message === "string") return error.message
  return "The agent reported that the turn failed."
}

/** What a session the run released resumes from, as the workspace keeps it. */
const savedOf = (state: Session.SessionState): SessionStateStore.Resume =>
  state.agentState === undefined ? { agent: state.agent } : { agent: state.agent, agentState: state.agentState }

/**
 * What a run of a turn is, as its parts are recorded: whose turn, on which agent, where its opening
 * sits in the log, and whether it continues the turn.
 *
 * @category models
 * @since 0.1.0
 */
export interface Run {
  readonly turnId: Turn.Id
  /** The agent the turn runs on. */
  readonly agent: string
  /** Where the run's opening sits in the log, which names its steps. */
  readonly openedAt: number
  /** Whether the run continues a turn the agent kept, which an earlier run started. */
  readonly continues: boolean
}

/**
 * What a run of a turn has recorded of the agent's parts so far, which the turn's end reads.
 *
 * @category models
 * @since 0.1.0
 */
export interface Progress {
  /** Whether the log notes that this run started the turn from its prompt. */
  readonly started: boolean
  /** The parts of the step being written, since the last that finished. */
  readonly stepParts: ReadonlyArray<StreamPart.StreamPart>
  /** How many steps finished. */
  readonly steps: number
  /** How much of each text part of the step being written readers were shown, by its position. */
  readonly shown: ReadonlyMap<number, number>
  /** When readers were last shown drafts, in milliseconds. */
  readonly shownAt: number
  /** The failure the agent reported, if it did. */
  readonly reported: unknown
}

/**
 * The progress of a run that has recorded nothing yet.
 *
 * @category constructors
 * @since 0.1.0
 */
export const initialProgress: Progress = {
  started: false,
  stepParts: [],
  steps: 0,
  shown: new Map(),
  shownAt: Number.NEGATIVE_INFINITY,
  reported: undefined
}

/**
 * What a run does with a part the agent streamed: its progress after it, what it appends to the
 * log, and what it shows readers.
 *
 * @category models
 * @since 0.1.0
 */
export interface Advance {
  readonly progress: Progress
  readonly entries: ReadonlyArray<SessionLog.Entry>
  readonly drafts: ReadonlyArray<Turn.Draft>
}

/** The id of the step at `index` of a run whose opening sits at `openedAt` in the log. */
const stepId = (openedAt: number, index: number) => `${openedAt}.${index}`

/**
 * What `run` does with `part`, streamed at `now`, given its `progress`. A run that starts the turn
 * from its prompt notes that with its first part, and an agent whose turn runs apart from the run
 * announces one it starts from the prompt (`turn-start`), with what continues it; a run that
 * continues the turn notes no start of its own. A step that finishes is appended to the log, added
 * up, with the id its drafts carried, and the step after starts from nothing shown. Any other part
 * joins the step being written, whose text is shown as drafts when it ends, and at most every
 * `draftInterval` milliseconds as it grows; an error the agent reports fails the turn.
 *
 * @category utils
 * @since 0.1.0
 */
export const advance = (run: Run, progress: Progress, part: StreamPart.StreamPart, now: number): Advance => {
  const notesStart = part.type === "turn-start" || (!run.continues && !progress.started)
  const noted: Progress = { ...progress, started: progress.started || notesStart }
  const entries: Array<SessionLog.Entry> = notesStart
    ? [
        {
          _tag: "Started",
          turnId: run.turnId,
          agent: run.agent,
          ...(part.type === "turn-start" ? { agentState: part.agentState } : {})
        }
      ]
    : []
  switch (part.type) {
    case "turn-start":
    case "finish":
      return { progress: noted, entries, drafts: [] }
    case "finish-step": {
      const [step] = StreamPart.stepsOf([...progress.stepParts, part])
      if (step !== undefined)
        entries.push({
          _tag: "Step",
          turnId: run.turnId,
          id: stepId(run.openedAt, progress.steps),
          step
        })
      return {
        progress: { ...noted, stepParts: [], steps: progress.steps + 1, shown: new Map() },
        entries,
        drafts: []
      }
    }
    default: {
      const stepParts = [...progress.stepParts, part]
      const reported = part.type === "error" ? part.error : progress.reported
      const showsDrafts =
        part.type === "text-end" || (part.type === "text-delta" && now - progress.shownAt >= draftInterval)
      if (!showsDrafts) return { progress: { ...noted, stepParts, reported }, entries, drafts: [] }
      const [step] = StreamPart.stepsOf(stepParts)
      const drafts = step === undefined ? [] : newDrafts(stepId(run.openedAt, progress.steps), step, progress.shown)
      const shown = new Map(progress.shown)
      for (const draft of drafts) shown.set(draft.part, draft.offset + draft.text.length)
      return { progress: { ...noted, stepParts, reported, shown, shownAt: now }, entries, drafts }
    }
  }
}

/**
 * Makes the turn runner of `job`, which `TurnJob`'s worker holds for the job's entity:
 * `runNextTurn` runs the agent's next turn, after any run in progress, `stopTurn` stops a turn
 * where it runs, and `giveUp` fails a turn the job could not run. It calls core's `TurnExecution`
 * and the session log store, entering the job's workspace through `Gateway.Gateway` for each call,
 * and reaches agents through the host's `Integrations`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("TurnRunner.make")(function* (job: TurnJobs.Job) {
  const runs = yield* Semaphore.make(1)
  /** The turn a run holds, and how to ask it to stop. */
  const running = yield* Ref.make<Running | undefined>(undefined)
  const gateway = yield* Gateway.Gateway

  /**
   * Run `program` in the job's workspace, holding the workspace only while `program` runs: a turn
   * runs for minutes, and the workspace may reload meanwhile.
   */
  const inWorkspace = <A, E>(program: Effect.Effect<A, E, Core.JobServices | Scope.Scope>) =>
    Effect.scoped(gateway.inWorkspace(job.workspaceId, program))

  /**
   * Show readers `drafts` of the turn's step, best effort: the step's entry in the log shows what
   * a missed one held.
   */
  const showDrafts = (turnId: Turn.Id, drafts: ReadonlyArray<Turn.Draft>) =>
    Effect.forEach(
      drafts,
      (draft) =>
        inWorkspace(TurnExecution.TurnExecution.use((turnExecution) => turnExecution.showDraft(turnId, draft))),
      { discard: true }
    ).pipe(
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        (cause) => Effect.logWarning("Drafts of a turn's step were not shown", cause)
      )
    )

  /**
   * Run the turn on the agent's harness until it ends or is stopped: start its session, kept in
   * `startedSession` for the run's end to release, then advance `progress` with each part the
   * agent streams, appending each step it finishes to the log and showing drafts of the step it is
   * writing. A turn the agent kept from a run that stopped short continues after the steps the log
   * has; any other starts from its prompt.
   */
  const runAgent = Effect.fnUntraced(function* (
    ready: SessionLogWriter.Ready,
    writer: SessionLogWriter.Writer,
    startedSession: Ref.Ref<TurnAgent.Started | undefined>,
    progress: Ref.Ref<Progress>
  ) {
    const turnId = ready.turn.id
    // A participation's session, and the sandbox it works in, are named after it.
    const sessionId = Agent.SessionId.make(ready.turn.participationId)
    const started = yield* TurnAgent.startSession(ready.runnable, sessionId, writer.opening)
    yield* Ref.set(startedSession, started)
    const { session, agent } = started
    const run: Run = {
      turnId,
      agent,
      openedAt: writer.openedAt,
      continues: session.hasUnfinishedTurn
    }
    const instructions = ready.runnable.instructions
    const turnOptions = instructions === "" ? {} : { instructions }
    const turn =
      writer.opening.resumeFrom?.unfinishedTurn === undefined
        ? session.stream({ prompt: writer.opening.prompt, ...turnOptions })
        : session.continueStream(turnOptions)
    // Recording a part is never cut short: a run stopped meanwhile stops between parts, so that
    // the progress kept matches the log.
    const recordPart = Effect.fnUntraced(function* (part: StreamPart.StreamPart) {
      const now = yield* Clock.currentTimeMillis
      const before = yield* Ref.get(progress)
      const { progress: after, entries, drafts } = advance(run, before, part, now)
      if (Array.isReadonlyArrayNonEmpty(entries)) yield* inWorkspace(writer.append(entries))
      yield* showDrafts(turnId, drafts)
      yield* Ref.set(progress, after)
    }, Effect.uninterruptible)
    yield* Stream.runForEach(turn, recordPart)
    const { reported } = yield* Ref.get(progress)
    return reported === undefined ? Outcome.Answered() : Outcome.Failed({ reason: describeError(reported) })
  })

  /** The agent could not run the turn: its harness, model, connection, or sandbox failed. */
  const failed = (error: { readonly message: string }) => Effect.succeed(Outcome.Failed({ reason: error.message }))

  /**
   * Start the turn and run it: open its session log, run the agent until the turn ends or is
   * asked to stop, log the step it left unfinished, release the session, and end the turn.
   */
  const runTurn = Effect.fnUntraced(
    function* (turnId: Turn.Id, stop: Deferred.Deferred<void>) {
      const start = yield* inWorkspace(TurnExecution.TurnExecution.use((turnExecution) => turnExecution.start(turnId)))
      if (TurnExecution.Start.isAnyOf(["Idle"])(start)) return
      const writer = yield* inWorkspace(SessionLogWriter.open(start))
      const startedSession = yield* Ref.make<TurnAgent.Started | undefined>(undefined)
      const progress = yield* Ref.make(initialProgress)
      const outcome = yield* runAgent(start, writer, startedSession, progress).pipe(
        Effect.catchTags({
          ConnectionError: failed,
          SandboxError: failed,
          HarnessError: failed,
          AiError: failed,
          PlatformError: failed
        }),
        Effect.raceFirst(Effect.as(Deferred.await(stop), Outcome.Stopped()))
      )
      const { stepParts, steps } = yield* Ref.get(progress)
      const [unfinished] = StreamPart.stepsOf(stepParts)
      if (unfinished !== undefined)
        yield* inWorkspace(
          writer.append([{ _tag: "Step", turnId, id: stepId(writer.openedAt, steps), step: unfinished }])
        )
      const started = yield* Ref.get(startedSession)
      const resume = yield* releaseSession(started)
      const entries = yield* writer.turnEntries
      yield* inWorkspace(
        TurnExecution.TurnExecution.use((turnExecution) =>
          Outcome.$match(outcome, {
            Answered: () =>
              resume === undefined
                ? Effect.die("A turn its agent answered has no session")
                : turnExecution.close(turnId, { reply: SessionLog.answerOf(entries), resume }),
            Failed: ({ reason }) => turnExecution.fail(turnId, { reason, resume }),
            Stopped: () => turnExecution.confirmStopped(turnId, { resume })
          })
        )
      )
    },
    // The agent's sandbox is reached for the run.
    Effect.scoped
  )

  /**
   * Run the agent's next turn in the thread, if work waits for one, after any run in progress:
   * the turn it has active, or one that accepts the work that waits. Answers the turn it ran.
   */
  const runNextTurn = runs.withPermit(
    Effect.gen(function* () {
      const accepted = yield* inWorkspace(
        TurnExecution.TurnExecution.use((turnExecution) => turnExecution.accept(job.memberId, job.threadId))
      ).pipe(Effect.mapError((cause) => new RunFailed({ turnId: undefined, cause })))
      if (Option.isNone(accepted)) return Option.none<Turn.Id>()
      const turnId = accepted.value.id
      const stop = yield* Deferred.make<void>()
      yield* Ref.set(running, { turnId, stop })
      yield* runTurn(turnId, stop).pipe(
        Effect.catchTag("SessionLogWriter.Superseded", () =>
          Effect.logWarning("Turn run superseded by another run of it", {
            workspaceId: job.workspaceId,
            turnId
          })
        ),
        Effect.mapError((cause) => new RunFailed({ turnId, cause })),
        Effect.catchDefect((cause) => Effect.fail(new RunFailed({ turnId, cause }))),
        Effect.ensuring(Ref.set(running, undefined))
      )
      return Option.some(turnId)
    })
  )

  /**
   * Stop the turn: the run that holds it stops it, and one no run holds ends as it stands, when it
   * was asked to stop or its participation ended.
   */
  const stopTurn = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const held = yield* Ref.get(running)
    if (held?.turnId === turnId) return yield* Effect.asVoid(Deferred.succeed(held.stop, undefined))
    yield* inWorkspace(TurnExecution.TurnExecution.use((turnExecution) => turnExecution.confirmStopped(turnId, {})))
  })

  /** Fail the turn its job could not run, for `reason`. */
  const giveUp = (turnId: Turn.Id, reason: string) =>
    inWorkspace(TurnExecution.TurnExecution.use((turnExecution) => turnExecution.fail(turnId, { reason })))

  return { runNextTurn, stopTurn, giveUp }
})

/** The turn a run holds, and how to ask it to stop. */
interface Running {
  readonly turnId: Turn.Id
  readonly stop: Deferred.Deferred<void>
}

/**
 * What the session resumes from once the run releases it: what its agent returned, or, when
 * releasing failed, the agent alone, which then starts from the conversation the log records.
 * None when the run started no session.
 */
const releaseSession = (started: TurnAgent.Started | undefined) => {
  if (started === undefined) return Effect.undefined
  return started.session.detach.pipe(
    Effect.map(savedOf),
    Effect.tapError((error) => Effect.logWarning("A turn's session was not released", error)),
    Effect.orElseSucceed((): SessionStateStore.Resume => ({ agent: started.agent }))
  )
}

/**
 * What `make` returns: `runNextTurn`, `stopTurn`, and `giveUp`.
 *
 * @category models
 * @since 0.1.0
 */
export type TurnRunner = Effect.Success<ReturnType<typeof make>>

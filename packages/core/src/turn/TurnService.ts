/**
 * The operations on turns an actor calls: reading a thread's turns as `Turn.View`s and the
 * workspace's active ones, following a turn's session log as it grows, asking an active turn to
 * stop, and retrying a failed or stopped one. A turn in a thread outside the reader's audience is
 * `CoreError.NotFound`; reading needs `thread.read` on the thread, and stopping or retrying needs
 * directing the turn's agent. Running turns is `TurnExecution`'s, for each agent's turn job; this
 * service only asks, through the commits it makes.
 *
 * @since 0.1.0
 */

import type { Log } from "@amends-dev/log"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Authorization from "../authorization/Authorization.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as ChangeFeedSource from "../change-feed/ChangeFeedSource.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import * as Request from "../request/Request.ts"
import * as Signal from "../signal/Signal.ts"
import * as SignalHub from "../signal/SignalHub.ts"
import type * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadPermissions from "../thread/ThreadPermissions.ts"
import * as ThreadQuery from "../thread/ThreadQuery.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as SessionLog from "./SessionLog.ts"
import * as Turn from "./Turn.ts"
import * as TurnActivity from "./TurnActivity.ts"
import * as TurnCommand from "./TurnCommand.ts"
import * as TurnFacts from "./TurnFacts.ts"
import * as TurnId from "./TurnId.ts"
import * as TurnQuery from "./TurnQuery.ts"
import * as TurnStore from "./TurnStore.ts"

/**
 * What reading a turn can fail with: `CoreError.NotFound`, and a denied `thread.read`.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * What listing active turns can fail with: `ReadError` but `CoreError.NotFound`, since turns the
 * reader may not read are left out.
 *
 * @category errors
 * @since 0.1.0
 */
export type ActiveError = CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * What opening a turn's log can fail with: `ReadError`, and `CoreError.Unavailable`.
 *
 * @category errors
 * @since 0.1.0
 */
export type WatchError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * What stopping or retrying a turn can fail with beyond its own outcome: `ReadError`, and what the
 * commit that records the change meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type ChangeError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What `cancel` can fail with: `ChangeError`, or `CoreError.Conflict` (`TurnNotActive`) for a turn
 * that already ended.
 *
 * @category errors
 * @since 0.1.0
 */
export type CancelError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What `retry` can fail with: `ChangeError`, or `CoreError.Conflict` (`NotRetryable`) with the
 * reason.
 *
 * @category errors
 * @since 0.1.0
 */
export type RetryError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * The turn operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class TurnService extends Context.Service<
  TurnService,
  {
    /**
     * A turn in a thread the reader may read: in its group's audience, with `thread.read` on it, as
     * its timeline requires. Outside the audience it is `CoreError.NotFound`; without the
     * permission, Denied.
     */
    readonly get: (turnId: TurnId.TurnId) => Effect.Effect<Turn.View, ReadError, Actor.Actor>
    /**
     * The workspace's active turns in threads the reader may read, oldest first, among at most
     * `limit` active turns in the workspace.
     */
    readonly listActive: (limit: number) => Effect.Effect<ReadonlyArray<Turn.View>, ActiveError, Actor.Actor>
    /**
     * Follow a turn's log, for a reader who may read its thread: its items as they stand, then
     * those its session log adds as the turn works, with the step it is writing, until the turn's
     * end commits and every item is delivered. The caller owns the subscription scope. The stream
     * fails with `CoreError.Unavailable`, `LogInterrupted`, when following cannot go on, including
     * once the reader may no longer read the thread, which it checks with each batch and whenever a
     * commit changes their groups or grants; following again starts from the items as they stand.
     */
    readonly watchLog: (
      turnId: TurnId.TurnId
    ) => Effect.Effect<Stream.Stream<Turn.LogMessage, CoreError.Unavailable>, WatchError, Actor.Actor | Scope.Scope>
    /**
     * Ask an active turn to stop, for a reader who may open its thread and direct its agent. A
     * queued turn stops at once, since nothing runs it yet; a running one stops once its job
     * confirms it. A turn already stopping stays as it is; a finished one is `CoreError.Conflict`.
     */
    readonly cancel: (turnId: TurnId.TurnId) => Effect.Effect<Turn.View, CancelError, Actor.Actor>
    /**
     * Run a failed or stopped turn again, for a reader who may open its thread and direct its
     * agent: a new turn for the same agent and input, which continues the session that turn left
     * and tells the agent who asked, on what the agent is set up with now. Only the agent's latest
     * turn on the thread can be retried, while the agent still takes part there; otherwise it is
     * `CoreError.Conflict`. A turn is retried at most once, so asking again returns the turn its
     * retry created.
     */
    readonly retry: (turnId: TurnId.TurnId) => Effect.Effect<Turn.View, RetryError, Actor.Actor>
  }
>()("@amends-dev/core/turn/TurnService") {}

/** Entries of a session log read at a time. */
const logPage = 100

/** The facts that end a turn. */
const endings: ReadonlySet<string> = new Set([
  TurnFacts.Completed.name,
  TurnFacts.Failed.name,
  TurnFacts.Cancelled.name
])

/** Whether a commit ends the turn: it holds a fact ending a turn, whose payload names this one. */
const endsTurn = (delivery: ChangeFeedSource.Delivery, turnId: TurnId.TurnId) =>
  delivery.events.some(
    ({ name, payload }) => endings.has(name) && Predicate.hasProperty(payload, "turnId") && payload.turnId === turnId
  )

/**
 * The service over the turn and participation stores, the session log store, the thread query,
 * authorization, the turn command, the journal, the signal hub, and the change feed.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const turnStore = yield* TurnStore.TurnStore
  const turnQuery = yield* TurnQuery.TurnQuery
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const authorization = yield* Authorization.Authorization
  const turnCommand = yield* TurnCommand.TurnCommand
  const journal = yield* Journal.Journal
  const sessionLogs = yield* SessionLog.SessionLogs
  const signalHub = yield* SignalHub.SignalHub
  const changeFeedSource = yield* ChangeFeedSource.ChangeFeedSource
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId

  const readThreadRequirement = (threadId: ThreadId.ThreadId) =>
    Requirement.make(ThreadPermissions.Read, Target.Reference.cases.Thread.make({ workspaceId, threadId }))
  /**
   * The thread, when the reader may open it and read it, as its timeline requires: every read of
   * its turns checks this. Outside its audience, it is missing to them.
   */
  const requireReadableThread = Effect.fnUntraced(function* (threadId: ThreadId.ThreadId) {
    const thread = yield* threadQuery.requireAccess(threadId)
    yield* authorization.require([readThreadRequirement(thread.id)])
    return thread
  })
  /** The turn, when the reader may read its thread; outside the thread's audience, it is missing. */
  const requireReadableTurn = Effect.fnUntraced(function* (turnId: TurnId.TurnId) {
    const found = yield* turnStore.get(turnId)
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "Turn", id: turnId })
    const turn = found.value
    yield* requireReadableThread(turn.threadId).pipe(
      Effect.catchTag("CoreError.NotFound", () => Effect.fail(new CoreError.NotFound({ resource: "Turn", id: turnId })))
    )
    return turn
  })
  /** The turns as the reader sees them, with what they may do with each now. */
  const toViews = Effect.fnUntraced(function* (list: ReadonlyArray<Turn.Turn>) {
    const directed = yield* authorization.permitted(list.map(Turn.directRequirement))
    return yield* Effect.forEach(list, (turn, index) =>
      Effect.map(turnQuery.whyNotRetryable(turn), (reason) =>
        Turn.view(turn, directed[index] === true, reason === undefined)
      )
    )
  })
  const toView = (turn: Turn.Turn) => Effect.map(toViews([turn]), (views) => views[0] as Turn.View)

  const get = Effect.fn("TurnService.get")(function* (turnId: TurnId.TurnId) {
    const turn = yield* requireReadableTurn(yield* Schema.decodeEffect(TurnId.TurnId)(turnId))
    return yield* toView(turn)
  }, Operation.report)

  const decodeLimit = Schema.decodeEffect(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))

  const listActive = Effect.fn("TurnService.listActive")(function* (limit: number) {
    const active = yield* turnStore.listActive(yield* decodeLimit(limit))
    // Each thread's audience is checked once, whatever number of its turns are active, then the
    // permission to read the threads in it, together.
    const opened = new Map<ThreadId.ThreadId, boolean>()
    for (const turn of active) {
      if (opened.has(turn.threadId)) continue
      const may = yield* threadQuery.requireAccess(turn.threadId).pipe(
        Effect.as(true),
        Effect.catchTag("CoreError.NotFound", () => Effect.succeed(false)),
        Effect.catchReason("CoreError.Denied", "NotGranted", () => Effect.succeed(false))
      )
      opened.set(turn.threadId, may)
    }
    const threads = [...opened].flatMap(([threadId, may]) => (may ? [threadId] : []))
    const permitted = yield* authorization.permitted(threads.map(readThreadRequirement))
    const readable = new Set(threads.filter((_, index) => permitted[index] === true))
    return yield* toViews(active.filter((turn) => readable.has(turn.threadId)))
  }, Operation.report)

  const logInterrupted = () => new CoreError.Unavailable({ reason: new CoreError.LogInterrupted() })

  const watchLog = Effect.fn("TurnService.watchLog")(function* (turnId: TurnId.TurnId) {
    const id = yield* Schema.decodeEffect(TurnId.TurnId)(turnId)
    // Register for drafts and commits before reading, so none that follows is missed: the turn's
    // end, or a change to the reader's access, committed after the reads below is delivered.
    const live = yield* signalHub.subscribe
    const committed = yield* changeFeedSource.subscribe(Option.none()).pipe(Effect.mapError(logInterrupted))
    const turn = yield* requireReadableTurn(id)
    // Following outlasts the request that opened it, so its access checks name the reader.
    const actor = yield* Actor.Actor
    /** The reader still may read the thread, or following ends. */
    const checkStillReadable = requireReadableThread(turn.threadId).pipe(
      Effect.provideService(Actor.Actor, actor),
      Effect.mapError(logInterrupted)
    )

    const sessionLog = sessionLogs.open(turn.participationId)
    const reader = SessionLog.reader(turn.id, Option.fromNullOr(turn.logAfter))
    /** The reads of the log past what the reader took. */
    const pastReader = () =>
      Option.match(reader.position(), {
        onNone: () => ({ limit: logPage }),
        onSome: (after) => ({ after, limit: logPage })
      })
    /** Read what the log holds past what the reader took, until it is all read. */
    const readLogSoFar = Effect.gen(function* () {
      for (;;) {
        const page = yield* sessionLog.read(pastReader())
        reader.add(page)
        if (page.length < logPage) return
      }
    })
    const endedMessage = Turn.LogMessage.cases.Ended.make({})

    yield* readLogSoFar
    if (!Turn.active(turn.status)) {
      reader.end(turn.messageIds)
      return Stream.make(Turn.LogMessage.cases.Opened.make({ items: reader.items() }), endedMessage)
    }
    const openedMessage = Turn.LogMessage.cases.Opened.make({ items: reader.items() })
    /** The items as sent, so that a change is told apart from what the reader has. */
    const sent = yield* Ref.make(openedMessage.items)
    /** What the items changed since they were last sent, if anything. */
    const changeMessages = Ref.modify(sent, (before): [ReadonlyArray<Turn.LogMessage>, ReadonlyArray<Turn.LogItem>] => {
      const items = reader.items()
      const changes = SessionLog.changesSince(before, items)
      return [changes.length === 0 ? [] : [Turn.LogMessage.cases.Changed.make({ changes })], items]
    })

    type Input = Data.TaggedEnum<{
      Logged: { readonly batch: Log.Batch<SessionLog.Entry> }
      Drafted: { readonly draft: Turn.LogMessage }
      AccessChanged: {}
      Ended: {}
    }>
    const Input = Data.taggedEnum<Input>()
    // The session log as it grows past the first read, on a position of its own.
    const loggedInputs = sessionLog.tail(pastReader()).pipe(
      Stream.map((batch) => Input.Logged({ batch })),
      Stream.mapError(logInterrupted)
    )
    const draftedInputs = live.pipe(
      Stream.filter(
        (signal): signal is Extract<Signal.Signal, { readonly _tag: "TurnDraft" }> =>
          Signal.Signal.isAnyOf(["TurnDraft"])(signal) && signal.turnId === turn.id
      ),
      Stream.map((signal): Input =>
        Input.Drafted({
          draft: Turn.LogMessage.cases.Drafted.make(signal.draft)
        })
      )
    )
    // Commits that end the turn, or change the reader's groups or grants, or everyone's, as a
    // role's permissions do.
    const committedInputs = committed.deliveries.pipe(
      Stream.map((delivery): ReadonlyArray<Input> => [
        ...(delivery.events.some(
          ({ access }) => access !== undefined && (access.memberId === undefined || access.memberId === actor.memberId)
        )
          ? [Input.AccessChanged()]
          : []),
        ...(endsTurn(delivery, turn.id) ? [Input.Ended()] : [])
      ]),
      Stream.flattenIterable,
      Stream.mapError(logInterrupted)
    )
    /** The turn as it ended, with what is left of its log: every entry precedes its end. */
    const readEnding = Effect.gen(function* () {
      yield* readLogSoFar
      const ended = yield* turnStore.get(turn.id)
      reader.end(Option.match(ended, { onNone: () => [], onSome: ({ messageIds }) => messageIds }))
      return [...(yield* changeMessages), endedMessage]
    }).pipe(Effect.mapError(logInterrupted))
    /**
     * What each input tells the reader, one at a time, so reads and what was sent agree. Once the
     * reader's access changes, it is checked before anything more is sent, drafts included.
     */
    const messagesFor = (input: Input): Effect.Effect<ReadonlyArray<Turn.LogMessage>, CoreError.Unavailable> =>
      Input.$match(input, {
        Drafted: ({ draft }) => Effect.succeed([draft]),
        AccessChanged: () => Effect.as(checkStillReadable, []),
        Logged: ({ batch }) =>
          checkStillReadable.pipe(
            Effect.andThen(Effect.sync(() => reader.add([batch]))),
            Effect.andThen(changeMessages)
          ),
        Ended: () => Effect.andThen(checkStillReadable, readEnding)
      })
    return Stream.make(openedMessage).pipe(
      Stream.concat(
        Stream.mergeAll([loggedInputs, draftedInputs, committedInputs], {
          concurrency: "unbounded"
        }).pipe(
          Stream.mapEffect(messagesFor),
          Stream.flattenIterable,
          Stream.takeUntil(Turn.LogMessage.isAnyOf(["Ended"]))
        )
      )
    )
  }, Operation.report)

  const cancel = Effect.fn("TurnService.cancel")(
    function* (turnId: TurnId.TurnId) {
      const turn = yield* requireReadableTurn(yield* Schema.decodeEffect(TurnId.TurnId)(turnId))
      yield* authorization.require([Turn.directRequirement(turn)])
      if (!Turn.active(turn.status))
        return yield* new CoreError.Conflict({
          reason: new CoreError.TurnNotActive({ turnId: turn.id, status: turn.status })
        })
      if (turn.status === "cancelling") return yield* toView(turn)
      return yield* toView(yield* turnCommand.requestStop(turn, "requested"))
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const retry = Effect.fn("TurnService.retry")(
    function* (turnId: TurnId.TurnId) {
      const id = yield* Schema.decodeEffect(TurnId.TurnId)(turnId)
      const turn = yield* requireReadableTurn(id)
      yield* authorization.require([Turn.directRequirement(turn)])
      // A turn is retried at most once, since its retry supersedes it, so the retry's ID comes from
      // the turn it retries and asking again returns that retry.
      const retryId = TurnId.TurnId.make(yield* Request.derivedId(["turn.retry", workspaceId, turn.id]))
      if (Option.isSome(yield* turnStore.get(retryId))) return yield* toView(yield* requireReadableTurn(retryId))
      const reason = yield* turnQuery.whyNotRetryable(turn)
      if (reason !== undefined)
        return yield* new CoreError.Conflict({
          reason: new CoreError.NotRetryable({ turnId: turn.id, reason })
        })
      // The same input, in the same session, created after the turn it retries, even on a clock
      // that has not moved, so it is the agent's latest there.
      const now = yield* DateTime.now
      const actor = yield* Actor.Actor
      const created = Turn.queued({
        id: retryId,
        workspaceId,
        groupId: turn.groupId,
        threadId: turn.threadId,
        agentId: turn.agentId,
        memberId: turn.memberId,
        participationId: turn.participationId,
        retry: { of: turn.id, by: actor.memberId },
        acceptedThroughSequence: turn.acceptedThroughSequence,
        logAfter: Option.getOrNull(yield* sessionLogs.open(turn.participationId).head),
        createdAt: DateTime.isGreaterThan(now, turn.createdAt) ? now : DateTime.add(turn.createdAt, { milliseconds: 1 })
      })
      const event = yield* journal.publish(TurnFacts.Retried, created)
      yield* turnCommand.recordActivity(
        created.threadId,
        TurnActivity.Created,
        { turnId: created.id, memberId: created.memberId, retryOf: turn.id },
        event
      )
      return yield* toView(created)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  return TurnService.of({ get, listActive, watchLog, cancel, retry })
})

/**
 * The turn operations, built by `make` from the workspace's services.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(TurnService, make)

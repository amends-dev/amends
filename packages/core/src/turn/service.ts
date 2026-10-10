import {
  Context,
  Crypto,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Ref,
  Schema,
  Stream,
  Struct,
} from "effect";
import type { PlatformError, Scope } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { ChangeFeedSource } from "../change-feed/source.ts";
import { Actor } from "../identity/actor.ts";
import type { ChangeFeedSource as Source } from "../change-feed/source.ts";
import { Journal } from "../journal/journal.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Request } from "../request/request.ts";
import { Signal } from "../signal/signal.ts";
import { SignalHub } from "../signal/hub.ts";
import { ThreadQuery } from "../thread/ThreadQuery.ts";
import type { ThreadId } from "../thread/ThreadId.ts";
import { ThreadParticipationStore } from "../thread/ThreadParticipationStore.ts";
import { ThreadPermissions } from "../thread/ThreadPermissions.ts";
import { NotActive, NotFound, NotRetryable } from "./errors.ts";
import { TurnActivity } from "./activity.ts";
import { TurnCommand } from "./command.ts";
import { TurnFacts } from "./facts.ts";
import { SessionLog } from "./session-log.ts";
import { SessionLogStore } from "./session-log-store.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";
export { NotActive, NotFound, NotRetryable } from "./errors.ts";

export type ReadError =
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | Exclude<Authorization.Error, Authorization.Denied>
  | TurnStore.Failure
  | ThreadParticipationStore.Failure
  | Schema.SchemaError
  | NotFound;
export type ActiveError = Exclude<ReadError, NotFound>;
export type WatchError = ReadError | SessionLogStore.Failure | Turn.LogUnavailable;
export type ChangeError =
  | ReadError
  | PlatformError.PlatformError
  | SessionLogStore.Failure
  | Projection.Error
  | TurnCommand.EndError;
export type CancelError = ChangeError | NotActive;
export type RetryError = ChangeError | NotRetryable;

export interface Interface {
  /**
   * A turn in a thread the reader may read: in its group's audience, with `thread.read` on it, as
   * its timeline requires. Outside the audience it is NotFound; without the permission, Denied.
   */
  readonly get: (turnId: Turn.Id) => Effect.Effect<Turn.View, ReadError, Actor.Service>;
  /**
   * The workspace's active turns in threads the reader may read, oldest first, among at most
   * `limit` active turns in the workspace.
   */
  readonly listActive: (
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Turn.View>, ActiveError, Actor.Service>;
  /**
   * Follow a turn's log, for a reader who may read its thread: its items as they stand, then
   * those its session log adds as the turn works, with the step it is writing, until the turn's
   * end commits and every item is delivered. The caller owns the subscription scope. The stream fails with
   * LogUnavailable when following cannot go on, including once the reader may no longer read the
   * thread, which it checks with each batch and whenever a commit changes their groups or grants;
   * following again starts from the items as they stand.
   */
  readonly watchLog: (
    turnId: Turn.Id,
  ) => Effect.Effect<
    Stream.Stream<Turn.LogMessage, Turn.LogUnavailable>,
    WatchError,
    Actor.Service | Scope.Scope
  >;
  /**
   * Ask an active turn to stop, for a reader who may open its thread and direct its agent. A
   * queued turn stops at once, since nothing runs it yet; a running one stops once its job
   * confirms it. A turn already stopping stays as it is; a finished one is NotActive.
   */
  readonly cancel: (turnId: Turn.Id) => Effect.Effect<Turn.View, CancelError, Actor.Service>;
  /**
   * Run a failed or stopped turn again, for a reader who may open its thread and direct its
   * agent: a new turn for the same agent and input, which continues the session that turn left
   * and tells the agent who asked, on what the agent is set up with now. Only the agent's latest
   * turn on the thread can be retried, while the agent still takes part there; otherwise it is
   * NotRetryable. A turn is retried at most once, so asking again returns the turn its retry
   * created.
   */
  readonly retry: (turnId: Turn.Id) => Effect.Effect<Turn.View, RetryError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/service/Service",
) {}

/** Entries of a session log read at a time. */
const logPage = 100;

/** The facts that end a turn. */
const endings: ReadonlySet<string> = new Set([
  TurnFacts.Completed.name,
  TurnFacts.Failed.name,
  TurnFacts.Cancelled.name,
]);

/** Whether a commit ends the turn: it holds a fact ending a turn, whose payload names this one. */
const endsTurn = (delivery: Source.Delivery, turnId: Turn.Id) =>
  delivery.events.some(
    ({ event }) =>
      endings.has(event.name) &&
      Predicate.hasProperty(event.payload, "turnId") &&
      event.payload.turnId === turnId,
  );

/** @category constructors */
export const make = Effect.fn("TurnService.make")(function* () {
  const turnStore = yield* TurnStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const authorization = yield* Authorization.Service;
  const turnCommand = yield* TurnCommand.Service;
  const journal = yield* Journal.Service;
  const sessionLogStore = yield* SessionLogStore.Service;
  const signalHub = yield* SignalHub.Service;
  const changeFeedSource = yield* ChangeFeedSource.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const readThreadRequirement = (threadId: ThreadId.Id) =>
    Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId });
  /**
   * The thread, when the reader may open it and read it, as its timeline requires: every read of
   * its turns checks this. Outside its audience, it is missing to them.
   */
  const requireReadableThread = Effect.fnUntraced(function* (threadId: ThreadId.Id) {
    const thread = yield* threadQuery.requireAccess(threadId);
    yield* authorization.require([readThreadRequirement(thread.id)]);
    return thread;
  });
  /** The turn, when the reader may read its thread; outside the thread's audience, it is missing. */
  const requireReadableTurn = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turnStore.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    const turn = found.value;
    yield* requireReadableThread(turn.threadId).pipe(
      Effect.catchTag("ThreadQuery.NotFound", () => Effect.fail(new NotFound({ turnId }))),
    );
    return turn;
  });
  const directAgentRequirement = (turn: Turn.Record) =>
    Requirement.make(AgentPermissions.Use, {
      _tag: "Member",
      workspaceId,
      memberId: turn.memberId,
    });

  /** Why the turn can't be retried now, or undefined when it can. */
  const whyNotRetryable = Effect.fnUntraced(function* (turn: Turn.Record) {
    if (Turn.active(turn.status)) return "active" as const;
    if (turn.status === "completed") return "completed" as const;
    if (Option.isSome(yield* turnStore.findActive(turn.memberId, turn.threadId)))
      return "superseded" as const;
    const latest = yield* turnStore.findLatest(turn.memberId, turn.threadId);
    if (Option.isSome(latest) && latest.value.id !== turn.id) return "superseded" as const;
    const participation = yield* threadParticipationStore.get(turn.participationId);
    if (Option.isNone(participation) || participation.value.status !== "active")
      return "departed" as const;
    return undefined;
  });

  /** The turns as the reader sees them, with what they may do with each now. */
  const toViews = Effect.fnUntraced(function* (list: ReadonlyArray<Turn.Record>) {
    const directed = yield* authorization.permitted(list.map(directAgentRequirement));
    return yield* Effect.forEach(list, (turn, index) =>
      Effect.gen(function* () {
        const mayDirect = directed[index] === true;
        const view: Turn.View = Object.assign({}, Struct.omit(turn, ["logAfter"]), {
          stoppable: mayDirect && Turn.active(turn.status) && turn.status !== "cancelling",
          retryable: mayDirect && (yield* whyNotRetryable(turn)) === undefined,
        });
        return view;
      }),
    );
  });
  const toView = (turn: Turn.Record) =>
    Effect.map(toViews([turn]), (views) => views[0] as Turn.View);

  const get = Effect.fn("TurnService.get")(function* (turnId: Turn.Id) {
    const turn = yield* requireReadableTurn(yield* Schema.decodeEffect(Turn.Id)(turnId));
    return yield* toView(turn);
  });

  const decodeLimit = Schema.decodeEffect(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  );

  const listActive = Effect.fn("TurnService.listActive")(function* (limit: number) {
    const active = yield* turnStore.listActive(yield* decodeLimit(limit));
    // Each thread's audience is checked once, whatever number of its turns are active, then the
    // permission to read the threads in it, together.
    const opened = new Map<ThreadId.Id, boolean>();
    for (const turn of active) {
      if (opened.has(turn.threadId)) continue;
      const may = yield* threadQuery.requireAccess(turn.threadId).pipe(
        Effect.as(true),
        Effect.catchTags({
          "ThreadQuery.NotFound": () => Effect.succeed(false),
          "Authorization.Denied": () => Effect.succeed(false),
        }),
      );
      opened.set(turn.threadId, may);
    }
    const threads = [...opened].flatMap(([threadId, may]) => (may ? [threadId] : []));
    const permitted = yield* authorization.permitted(threads.map(readThreadRequirement));
    const readable = new Set(threads.filter((_, index) => permitted[index] === true));
    return yield* toViews(active.filter((turn) => readable.has(turn.threadId)));
  });

  const toLogUnavailable = () => new Turn.LogUnavailable({});

  const watchLog = Effect.fn("TurnService.watchLog")(function* (turnId: Turn.Id) {
    const id = yield* Schema.decodeEffect(Turn.Id)(turnId);
    // Register for drafts and commits before reading, so none that follows is missed: the turn's
    // end, or a change to the reader's access, committed after the reads below is delivered.
    const live = yield* signalHub.subscribe;
    const committed = yield* changeFeedSource
      .subscribe(Option.none())
      .pipe(Effect.mapError(toLogUnavailable));
    const turn = yield* requireReadableTurn(id);
    // Following outlasts the request that opened it, so its access checks name the reader.
    const actor = yield* Actor.Service;
    /** The reader still may read the thread, or following ends. */
    const checkStillReadable = requireReadableThread(turn.threadId).pipe(
      Effect.provideService(Actor.Service, actor),
      Effect.mapError(toLogUnavailable),
    );

    const reader = SessionLog.reader(turn.id, turn.logAfter);
    /** Read what the log holds past what the reader took, until it is all read. */
    const readLogSoFar = Effect.gen(function* () {
      for (;;) {
        const page = yield* sessionLogStore.read(turn.participationId, {
          after: reader.position(),
          limit: logPage,
        });
        reader.add(page);
        if (page.length < logPage) return;
      }
    });
    const endedMessage = Turn.LogMessage.cases.Ended.make({});

    yield* readLogSoFar;
    if (!Turn.active(turn.status)) {
      reader.end(turn.messageIds);
      return Stream.make(
        Turn.LogMessage.cases.Opened.make({ items: reader.items() }),
        endedMessage,
      );
    }
    const openedMessage = Turn.LogMessage.cases.Opened.make({ items: reader.items() });
    /** The items as sent, so that a change is told apart from what the reader has. */
    const sent = yield* Ref.make(openedMessage.items);
    /** What the items changed since they were last sent, if anything. */
    const changeMessages = Ref.modify(
      sent,
      (before): [ReadonlyArray<Turn.LogMessage>, ReadonlyArray<Turn.LogItem>] => {
        const items = reader.items();
        const changes = SessionLog.changesSince(before, items);
        return [
          changes.length === 0 ? [] : [Turn.LogMessage.cases.Changed.make({ changes })],
          items,
        ];
      },
    );

    type Input = Data.TaggedEnum<{
      Logged: { readonly recorded: ReadonlyArray<SessionLog.Recorded> };
      Drafted: { readonly draft: Turn.LogMessage };
      AccessChanged: {};
      Ended: {};
    }>;
    const Input = Data.taggedEnum<Input>();
    // The session log as it grows past the first read, on a position of its own.
    const loggedInputs = Stream.paginate(
      reader.position(),
      Effect.fnUntraced(function* (after: number) {
        yield* sessionLogStore.waitForAppend(turn.participationId, after);
        const page = yield* sessionLogStore.read(turn.participationId, { after, limit: logPage });
        return [
          [Input.Logged({ recorded: page })],
          Option.some(page.at(-1)?.position ?? after),
        ] as const;
      }),
    ).pipe(Stream.mapError(toLogUnavailable));
    const draftedInputs = live.pipe(
      Stream.filter(
        (signal): signal is Extract<Signal.Value, { readonly _tag: "TurnDraft" }> =>
          Signal.Value.isAnyOf(["TurnDraft"])(signal) && signal.turnId === turn.id,
      ),
      Stream.map((signal): Input =>
        Input.Drafted({
          draft: Turn.LogMessage.cases.Drafted.make(signal.draft),
        }),
      ),
    );
    // Commits that end the turn, or change the reader's groups or grants, or everyone's, as a
    // role's permissions do.
    const committedInputs = committed.deliveries.pipe(
      Stream.map((delivery): ReadonlyArray<Input> => [
        ...(delivery.events.some(
          ({ access }) =>
            access !== undefined &&
            (access.memberId === undefined || access.memberId === actor.memberId),
        )
          ? [Input.AccessChanged()]
          : []),
        ...(endsTurn(delivery, turn.id) ? [Input.Ended()] : []),
      ]),
      Stream.flattenIterable,
      Stream.mapError(toLogUnavailable),
    );
    /** The turn as it ended, with what is left of its log: every entry precedes its end. */
    const readEnding = Effect.gen(function* () {
      yield* readLogSoFar;
      const ended = yield* turnStore.get(turn.id);
      reader.end(Option.match(ended, { onNone: () => [], onSome: ({ messageIds }) => messageIds }));
      return [...(yield* changeMessages), endedMessage];
    }).pipe(Effect.mapError(toLogUnavailable));
    /**
     * What each input tells the reader, one at a time, so reads and what was sent agree. Once the
     * reader's access changes, it is checked before anything more is sent, drafts included.
     */
    const messagesFor = (
      input: Input,
    ): Effect.Effect<ReadonlyArray<Turn.LogMessage>, Turn.LogUnavailable> =>
      Input.$match(input, {
        Drafted: ({ draft }) => Effect.succeed([draft]),
        AccessChanged: () => Effect.as(checkStillReadable, []),
        Logged: ({ recorded }) =>
          checkStillReadable.pipe(
            Effect.andThen(Effect.sync(() => reader.add(recorded))),
            Effect.andThen(changeMessages),
          ),
        Ended: () => Effect.andThen(checkStillReadable, readEnding),
      });
    return Stream.make(openedMessage).pipe(
      Stream.concat(
        Stream.mergeAll([loggedInputs, draftedInputs, committedInputs], {
          concurrency: "unbounded",
        }).pipe(
          Stream.mapEffect(messagesFor),
          Stream.flattenIterable,
          Stream.takeUntil(Turn.LogMessage.isAnyOf(["Ended"])),
        ),
      ),
    );
  });

  /**
   * Ask an active turn to stop, in the caller's commit: a queued one ends cancelled at once, since
   * nothing runs it yet; a running one is marked stopping, which its job confirms once it has
   * stopped. Returns the turn as it now stands.
   */
  const requestStop = Effect.fnUntraced(function* (turn: Turn.Record) {
    const requestedAt = yield* DateTime.now;
    const requested = yield* journal.publish(TurnFacts.CancelRequested, {
      workspaceId,
      groupId: turn.groupId,
      threadId: turn.threadId,
      memberId: turn.memberId,
      turnId: turn.id,
      reason: "requested",
      requestedAt,
    });
    if (turn.status === "queued") {
      yield* turnCommand.endTurn(turn, { outcome: "cancelled", cancelReason: "requested" });
      return Turn.change(turn, {
        status: "cancelled",
        cancelReason: "requested",
        finishedAt: requestedAt,
      });
    }
    yield* turnCommand.recordActivity(
      turn.threadId,
      TurnActivity.Stopping,
      { turnId: turn.id, cancelReason: "requested" },
      requested,
    );
    return Turn.change(turn, { status: "cancelling", cancelReason: "requested" });
  });

  const cancel = Effect.fn("TurnService.cancel")(
    function* (turnId: Turn.Id) {
      const turn = yield* requireReadableTurn(yield* Schema.decodeEffect(Turn.Id)(turnId));
      yield* authorization.require([directAgentRequirement(turn)]);
      if (!Turn.active(turn.status))
        return yield* new NotActive({ turnId: turn.id, status: turn.status });
      if (turn.status === "cancelling") return yield* toView(turn);
      return yield* toView(yield* requestStop(turn));
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const retry = Effect.fn("TurnService.retry")(
    function* (turnId: Turn.Id) {
      const id = yield* Schema.decodeEffect(Turn.Id)(turnId);
      const turn = yield* requireReadableTurn(id);
      yield* authorization.require([directAgentRequirement(turn)]);
      // A turn is retried at most once, since its retry supersedes it, so the retry's ID comes from
      // the turn it retries and asking again returns that retry.
      const retryId = Turn.Id.make(yield* Request.derivedId(["turn.retry", workspaceId, turn.id]));
      if (Option.isSome(yield* turnStore.get(retryId)))
        return yield* toView(yield* requireReadableTurn(retryId));
      const reason = yield* whyNotRetryable(turn);
      if (reason !== undefined) return yield* new NotRetryable({ turnId: turn.id, reason });
      // The same input, in the same session, created after the turn it retries, even on a clock
      // that has not moved, so it is the agent's latest there.
      const now = yield* DateTime.now;
      const actor = yield* Actor.Service;
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
        logAfter: yield* sessionLogStore.head(turn.participationId),
        createdAt: DateTime.isGreaterThan(now, turn.createdAt)
          ? now
          : DateTime.add(turn.createdAt, { milliseconds: 1 }),
      });
      const event = yield* journal.publish(TurnFacts.Retried, created);
      yield* turnCommand.recordActivity(
        created.threadId,
        TurnActivity.Created,
        { turnId: created.id, memberId: created.memberId, retryOf: turn.id },
        event,
      );
      return yield* toView(created);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({ get, listActive, watchLog, cancel, retry });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnService from "./service.ts";

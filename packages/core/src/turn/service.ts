import { Context, Crypto, DateTime, Effect, Layer, Option, Schema, Stream } from "effect";
import type { PlatformError, Scope } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { ChangeFeedSource } from "../change-feed/source.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Request } from "../request/request.ts";
import { Signal } from "../signal/signal.ts";
import { SignalHub } from "../signal/hub.ts";
import { ThreadQuery } from "../thread/query.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { ThreadPermissions } from "../thread/permissions.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { NotActive, NotFound, NotRetryable, ThreadNotFound } from "./errors.ts";
import { TurnActivity } from "./activity.ts";
import { TurnCommand } from "./command.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnQuery } from "./query.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";
export { NotActive, NotFound, NotRetryable, ThreadNotFound } from "./errors.ts";

export type ReadError =
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | Exclude<Authorization.Error, Authorization.Denied>
  | TurnStore.Failure
  | ThreadParticipationStore.Failure
  | Schema.SchemaError
  | NotFound;
export type ListError = Exclude<ReadError, NotFound> | ThreadNotFound;
export type ActiveError = Exclude<ReadError, NotFound>;
export type LogError = ReadError | Log.ReadError;
export type WatchError = LogError | Turn.LogUnavailable;
export type ChangeError =
  | ReadError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | TurnCommand.EndError;
export type CancelError = ChangeError | NotActive;
export type RetryError = ChangeError | NotRetryable | MemberStore.Failure | Log.ReadError;

export interface Interface {
  /**
   * A turn in a thread the reader may read: in its group's audience, with `thread.read` on it, as
   * its timeline requires. Outside the audience it is NotFound; without the permission, Denied.
   */
  readonly get: (turnId: Turn.Id) => Effect.Effect<Turn.View, ReadError, Actor.Service>;
  /** A thread's turns, newest first, at most `limit`, for a reader who may read the thread. */
  readonly listByThread: (
    threadId: ThreadId.Id,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Turn.View>, ListError, Actor.Service>;
  /**
   * The workspace's active turns in threads the reader may read, oldest first, among at most
   * `limit` active turns in the workspace.
   */
  readonly listActive: (
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Turn.View>, ActiveError, Actor.Service>;
  /** A turn with its log, for a reader who may read its thread. */
  readonly log: (turnId: Turn.Id) => Effect.Effect<Turn.LogView, LogError, Actor.Service>;
  /**
   * Follow a turn's log, for a reader who may read its thread: its items as they stand, then
   * those its agent's log adds or changes as the turn works, with the response it is writing, until
   * the turn ends and every item is delivered. The caller owns the subscription scope. The stream
   * fails with LogUnavailable when following cannot go on, including once the reader may no longer
   * read the thread, which it checks with each batch and whenever a commit changes their groups or
   * grants; following again starts from the items as they stand.
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
   * queued turn stops at once, since nothing runs it yet; a running one stops once execution
   * confirms it. A turn already stopping stays as it is; a finished one is NotActive.
   */
  readonly cancel: (turnId: Turn.Id) => Effect.Effect<Turn.View, CancelError, Actor.Service>;
  /**
   * Run a failed or stopped turn again, for a reader who may open its thread and direct its
   * agent: a new turn for the same agent and input, which continues from what that turn left and
   * takes the request as new input, running with the agent's current configuration. Only the agent's latest turn on the thread can be retried, while the agent
   * still takes part there; otherwise it is NotRetryable. A turn is retried at most once, so
   * asking again returns the turn its retry created.
   */
  readonly retry: (turnId: Turn.Id) => Effect.Effect<Turn.View, RetryError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/service/Service",
) {}

/** Batches of a turn's log read at a time. */
const logPage = 100;

/** @category constructors */
export const make = Effect.fn("TurnService.make")(function* () {
  const turnStore = yield* TurnStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const authorization = yield* Authorization.Service;
  const memberStore = yield* MemberStore.Service;
  const turnCommand = yield* TurnCommand.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const signalHub = yield* SignalHub.Service;
  const turnQuery = yield* TurnQuery.Service;
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

  /**
   * The turns as the reader sees them, with what they may do with each now. In a list of one
   * thread's turns, newest first, only each agent's first can be its latest, so the others need
   * no reads to tell they were superseded.
   */
  const toViews = Effect.fnUntraced(function* (
    list: ReadonlyArray<Turn.Record>,
    options: { readonly newestFirst?: boolean } = {},
  ) {
    const directed = yield* authorization.permitted(list.map(directAgentRequirement));
    const seen = new Set<string>();
    return yield* Effect.forEach(list, (turn, index) =>
      Effect.gen(function* () {
        const mayDirect = directed[index] === true;
        const later = options.newestFirst === true && seen.has(turn.memberId);
        seen.add(turn.memberId);
        const view: Turn.View = Object.assign({}, turn, {
          stoppable: mayDirect && Turn.active(turn.status) && turn.status !== "cancelling",
          retryable: mayDirect && !later && (yield* whyNotRetryable(turn)) === undefined,
        });
        return view;
      }),
    );
  });
  const toView = (turn: Turn.Record) =>
    Effect.map(toViews([turn]), (views) => views[0] as Turn.View);

  const get = Effect.fn("TurnService.get")(function* (turnId: Turn.Id) {
    return yield* toView(yield* requireReadableTurn(yield* Schema.decodeEffect(Turn.Id)(turnId)));
  });

  const listByThread = Effect.fn("TurnService.listByThread")(function* (
    threadId: ThreadId.Id,
    limit: number,
  ) {
    const id = yield* Schema.decodeEffect(ThreadId.Id)(threadId);
    const count = yield* decodeLimit(limit);
    const thread = yield* requireReadableThread(id).pipe(
      Effect.catchTag("ThreadQuery.NotFound", () =>
        Effect.fail(new ThreadNotFound({ threadId: id })),
      ),
    );
    return yield* toViews(yield* turnStore.listByThread(thread.id, count), { newestFirst: true });
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

  const readLog = Effect.fn("TurnService.log")(function* (turnId: Turn.Id) {
    const turn = yield* requireReadableTurn(yield* Schema.decodeEffect(Turn.Id)(turnId));
    return {
      turn: yield* toView(turn),
      items: TurnLog.read(yield* TurnLog.readTurnEntries(log, turn)).items,
    } satisfies Turn.LogView;
  });

  const isSameItem = Schema.toEquivalence(Turn.LogItem);
  const toLogUnavailable = () => new Turn.LogUnavailable({});

  const watchLog = Effect.fn("TurnService.watchLog")(function* (turnId: Turn.Id) {
    const id = yield* Schema.decodeEffect(Turn.Id)(turnId);
    // Register for drafts and commits before reading, so none that follows is missed: a change to
    // the reader's access committed after the read below is delivered, and rechecked.
    const live = yield* signalHub.subscribe;
    const committed = yield* changeFeedSource
      .subscribe(Option.none())
      .pipe(Effect.mapError(toLogUnavailable));
    const turn = yield* requireReadableTurn(id);
    const handle = TurnLog.open(log, turn.participationId);
    // Following outlasts the request that opened it, so its access checks name the reader.
    const actor = yield* Actor.Service;
    /** The reader still may read the thread, or following ends. */
    const checkStillReadable = requireReadableThread(turn.threadId).pipe(
      Effect.provideService(Actor.Service, actor),
      Effect.mapError(toLogUnavailable),
    );

    // The turn's entries sit together in its agent's log after `logAfter`, read as they come, and
    // end with its end: only one turn writes there at a time, so another turn's entry also means
    // this one's are over.
    const reader = TurnLog.reader();
    let after = turn.logAfter ?? undefined;
    let over = false;
    const takeEntries = (batches: ReadonlyArray<Log.Batch<TurnLog.Entry>>) => {
      for (const batch of batches) {
        for (const entry of batch.entries) {
          if (entry.payload.turnId !== turn.id) {
            over = true;
            return;
          }
          reader.add({ entry: entry.payload, at: entry.recordedAt, position: batch.position });
          if (TurnLog.Entry.isAnyOf(["Ended"])(entry.payload)) over = true;
        }
        after = batch.position;
        if (over) return;
      }
    };
    /** Read what the log holds past what was taken, until the turn's entries are over. */
    const readLogSoFar = Effect.gen(function* () {
      while (!over) {
        const batches = yield* handle.read(
          after === undefined ? { limit: logPage } : { after, limit: logPage },
        );
        if (batches.length === 0) return;
        takeEntries(batches);
      }
    });
    // The items as sent, so a change is told apart from what the reader has.
    let sent: ReadonlyArray<Turn.LogItem> = [];
    const collectChanges = (): ReadonlyArray<Turn.LogChange> => {
      const items = reader.currentReading().items;
      const changed = items.flatMap((item, index) => {
        const before = sent[index];
        return before !== undefined && isSameItem(before, item) ? [] : [{ index, item }];
      });
      sent = items;
      return changed;
    };
    const changeMessages = (): ReadonlyArray<Turn.LogMessage> => {
      const list = collectChanges();
      return list.length === 0 ? [] : [Turn.LogMessage.cases.Changed.make({ changes: list })];
    };
    const endedMessage = Turn.LogMessage.cases.Ended.make({});

    yield* readLogSoFar;
    sent = reader.currentReading().items;
    const openedMessage = Turn.LogMessage.cases.Opened.make({ items: sent });
    if (over || !Turn.active(turn.status)) return Stream.make(openedMessage, endedMessage);
    // What the response being written holds so far, since drafts carry only what follows it.
    const draftsSoFar = (yield* turnQuery.currentDrafts(turn.id)).map((draft) =>
      Turn.LogMessage.cases.Drafted.make({ ...draft, offset: 0 }),
    );

    type Input =
      | { readonly _tag: "Logged"; readonly batch: Log.Batch<TurnLog.Entry> }
      | { readonly _tag: "Drafted"; readonly draft: Turn.LogMessage }
      | { readonly _tag: "AccessChanged" };
    const loggedInputs = Stream.suspend(() =>
      handle.tail(after === undefined ? { limit: logPage } : { after, limit: logPage }),
    ).pipe(
      Stream.map((batch): Input => ({ _tag: "Logged", batch })),
      Stream.mapError(toLogUnavailable),
    );
    const draftedInputs = live.pipe(
      Stream.filter(
        (signal): signal is Extract<Signal.Value, { readonly _tag: "TurnDraft" }> =>
          Signal.Value.isAnyOf(["TurnDraft"])(signal) && signal.turnId === turn.id,
      ),
      Stream.map((signal): Input => ({
        _tag: "Drafted",
        draft: Turn.LogMessage.cases.Drafted.make({
          responseId: signal.responseId,
          part: signal.part,
          offset: signal.offset,
          text: signal.text,
        }),
      })),
    );
    // Commits that change the reader's groups or grants, or everyone's, as a role's permissions do.
    const accessChangedInputs = committed.deliveries.pipe(
      Stream.filter((delivery) =>
        delivery.events.some(
          ({ access }) =>
            access !== undefined &&
            (access.memberId === undefined || access.memberId === actor.memberId),
        ),
      ),
      Stream.map((): Input => ({ _tag: "AccessChanged" })),
      Stream.mapError(toLogUnavailable),
    );
    /**
     * What each input tells the reader, one at a time, so reads and what was sent agree. Once the
     * reader's access changes, it is checked before anything more is sent, drafts included.
     */
    const messagesFor = (
      input: Input,
    ): Effect.Effect<ReadonlyArray<Turn.LogMessage>, Turn.LogUnavailable> => {
      switch (input._tag) {
        case "Drafted":
          return Effect.succeed([input.draft]);
        case "AccessChanged":
          return Effect.as(checkStillReadable, []);
        case "Logged":
          return checkStillReadable.pipe(
            Effect.map(() => {
              takeEntries([input.batch]);
              // The turn's end is in its log, committed with everything it wrote.
              return over ? [...changeMessages(), endedMessage] : changeMessages();
            }),
          );
      }
    };
    return Stream.make(openedMessage, ...draftsSoFar).pipe(
      Stream.concat(
        Stream.mergeAll([loggedInputs, draftedInputs, accessChangedInputs], {
          concurrency: "unbounded",
        }).pipe(
          Stream.mapEffect(messagesFor),
          Stream.flattenIterable,
          Stream.takeUntil(Turn.LogMessage.isAnyOf(["Ended"])),
        ),
      ),
    );
  });

  const cancel = Effect.fn("TurnService.cancel")(
    function* (turnId: Turn.Id) {
      const turn = yield* requireReadableTurn(yield* Schema.decodeEffect(Turn.Id)(turnId));
      yield* authorization.require([directAgentRequirement(turn)]);
      if (!Turn.active(turn.status))
        return yield* new NotActive({ turnId: turn.id, status: turn.status });
      if (turn.status === "cancelling") return yield* toView(turn);
      return yield* toView(yield* turnCommand.requestStop(turn, "requested"));
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
      const handle = TurnLog.open(log, turn.participationId);
      // The same input, continuing after the failed or stopped turn in the agent's log: its
      // input starts after what that turn took in, from the latest checkpoint the log holds,
      // with the agent's current model access and environment. It is created after the turn
      // it retries, even on a clock that has not moved, so it is the agent's latest there.
      const retried = TurnLog.read(yield* TurnLog.readTurnEntries(log, turn));
      const now = yield* DateTime.now;
      const createdAt = DateTime.isGreaterThan(now, turn.createdAt)
        ? now
        : DateTime.add(turn.createdAt, { milliseconds: 1 });
      const created: Turn.Record = {
        id: retryId,
        workspaceId,
        groupId: turn.groupId,
        threadId: turn.threadId,
        agentId: turn.agentId,
        memberId: turn.memberId,
        participationId: turn.participationId,
        logAfter: Option.getOrNull(yield* handle.head),
        historyFrom: retried.checkpoint ?? turn.historyFrom,
        retryOf: turn.id,
        status: "queued",
        inputAfterSequence: retried.incorporatedThrough(turn.inputAfterSequence),
        acceptedThroughSequence: turn.acceptedThroughSequence,
        selection: null,
        messageIds: [],
        failure: null,
        cancelReason: null,
        createdAt,
        startedAt: null,
        finishedAt: null,
      };
      const event = yield* journal.publish(TurnFacts.Retried, created);
      yield* turnCommand.recordActivity(
        created.threadId,
        TurnActivity.Created,
        { turnId: created.id, memberId: created.memberId, retryOf: turn.id },
        event,
      );
      // Who asked is the retry's new input, after what the turn it retries left.
      const actor = yield* Actor.Service;
      const asker = yield* memberStore.get(actor.memberId);
      yield* handle.append({
        _tag: "Requested",
        turnId: created.id,
        input: {
          _tag: "Input",
          author: {
            id: actor.memberId,
            name: Option.match(asker, {
              onNone: () => "A member",
              onSome: (member) => member.name ?? "A member",
            }),
          },
          content: [{ _tag: "Text", text: "Please try that again." }],
        },
      });
      return yield* toView(created);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({
    get,
    listByThread,
    listActive,
    log: readLog,
    watchLog,
    cancel,
    retry,
  });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnService from "./service.ts";

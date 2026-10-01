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
import type { Signal } from "../signal/signal.ts";
import { Signals } from "../signal/signals.ts";
import { ThreadAccess } from "../thread/access.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { ThreadPermissions } from "../thread/permissions.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { NotActive, NotFound, NotRetryable, ThreadNotFound } from "./errors.ts";
import { TurnActivity } from "./activity.ts";
import { TurnActivityRecorder } from "./activity-recorder.ts";
import { TurnDrafts } from "./drafts.ts";
import { TurnEnding } from "./ending.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";
export { NotActive, NotFound, NotRetryable, ThreadNotFound } from "./errors.ts";

export type ReadError =
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound>
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
  | TurnActivityRecorder.Error
  | TurnEnding.Error;
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
  "@amends/core/turn/application/Service",
) {}

/** Batches of a turn's log read at a time. */
const logPage = 100;

/** @category constructors */
export const make = Effect.fn("TurnApplication.make")(function* () {
  const turns = yield* TurnStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const access = yield* ThreadAccess.Service;
  const authorization = yield* Authorization.Service;
  const members = yield* MemberStore.Service;
  const activity = yield* TurnActivityRecorder.Service;
  const ending = yield* TurnEnding.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const signals = yield* Signals.Service;
  const drafts = yield* TurnDrafts.Service;
  const commits = yield* ChangeFeedSource.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const readThread = (threadId: ThreadId.Id) =>
    Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId });
  /**
   * The thread, when the reader may open it and read it, as its timeline requires: every read of
   * its turns checks this. Outside its audience, it is missing to them.
   */
  const readableThread = Effect.fnUntraced(function* (threadId: ThreadId.Id) {
    const thread = yield* access.require(threadId);
    yield* authorization.require([readThread(thread.id)]);
    return thread;
  });
  /** The turn, when the reader may read its thread; outside the thread's audience, it is missing. */
  const readable = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turns.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    const turn = found.value;
    yield* readableThread(turn.threadId).pipe(
      Effect.catchTag("ThreadAccess.NotFound", () => Effect.fail(new NotFound({ turnId }))),
    );
    return turn;
  });
  const directs = (turn: Turn.Record) =>
    Requirement.make(AgentPermissions.Use, {
      _tag: "Member",
      workspaceId,
      memberId: turn.memberId,
    });

  /** Why the turn can't be retried now, or undefined when it can. */
  const retryBlock = Effect.fnUntraced(function* (turn: Turn.Record) {
    if (Turn.active(turn.status)) return "active" as const;
    if (turn.status === "completed") return "completed" as const;
    if (Option.isSome(yield* turns.findActive(turn.memberId, turn.threadId)))
      return "superseded" as const;
    const latest = yield* turns.findLatest(turn.memberId, turn.threadId);
    if (Option.isSome(latest) && latest.value.id !== turn.id) return "superseded" as const;
    const participation = yield* participations.get(turn.participationId);
    if (Option.isNone(participation) || participation.value.status !== "active")
      return "departed" as const;
    return undefined;
  });

  /**
   * The turns as the reader sees them, with what they may do with each now. In a list of one
   * thread's turns, newest first, only each agent's first can be its latest, so the others need
   * no reads to tell they were superseded.
   */
  const present = Effect.fnUntraced(function* (
    list: ReadonlyArray<Turn.Record>,
    options: { readonly newestFirst?: boolean } = {},
  ) {
    const directed = yield* authorization.permitted(list.map(directs));
    const seen = new Set<string>();
    return yield* Effect.forEach(list, (turn, index) =>
      Effect.gen(function* () {
        const mayDirect = directed[index] === true;
        const later = options.newestFirst === true && seen.has(turn.memberId);
        seen.add(turn.memberId);
        const view: Turn.View = Object.assign({}, turn, {
          stoppable: mayDirect && Turn.active(turn.status) && turn.status !== "cancelling",
          retryable: mayDirect && !later && (yield* retryBlock(turn)) === undefined,
        });
        return view;
      }),
    );
  });
  const presentOne = (turn: Turn.Record) =>
    Effect.map(present([turn]), (views) => views[0] as Turn.View);

  const get = Effect.fn("TurnApplication.get")(function* (turnId: Turn.Id) {
    return yield* presentOne(yield* readable(yield* Schema.decodeEffect(Turn.Id)(turnId)));
  });

  const listByThread = Effect.fn("TurnApplication.listByThread")(function* (
    threadId: ThreadId.Id,
    limit: number,
  ) {
    const id = yield* Schema.decodeEffect(ThreadId.Id)(threadId);
    const count = yield* bounded(limit);
    const thread = yield* readableThread(id).pipe(
      Effect.catchTag("ThreadAccess.NotFound", () =>
        Effect.fail(new ThreadNotFound({ threadId: id })),
      ),
    );
    return yield* present(yield* turns.listByThread(thread.id, count), { newestFirst: true });
  });

  const bounded = Schema.decodeEffect(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  );

  const listActive = Effect.fn("TurnApplication.listActive")(function* (limit: number) {
    const active = yield* turns.listActive(yield* bounded(limit));
    // Each thread's audience is checked once, whatever number of its turns are active, then the
    // permission to read the threads in it, together.
    const opened = new Map<ThreadId.Id, boolean>();
    for (const turn of active) {
      if (opened.has(turn.threadId)) continue;
      const may = yield* access.require(turn.threadId).pipe(
        Effect.as(true),
        Effect.catchTags({
          "ThreadAccess.NotFound": () => Effect.succeed(false),
          "Authorization.Denied": () => Effect.succeed(false),
        }),
      );
      opened.set(turn.threadId, may);
    }
    const threads = [...opened].flatMap(([threadId, may]) => (may ? [threadId] : []));
    const permitted = yield* authorization.permitted(threads.map(readThread));
    const readable = new Set(threads.filter((_, index) => permitted[index] === true));
    return yield* present(active.filter((turn) => readable.has(turn.threadId)));
  });

  const readLog = Effect.fn("TurnApplication.log")(function* (turnId: Turn.Id) {
    const turn = yield* readable(yield* Schema.decodeEffect(Turn.Id)(turnId));
    return {
      turn: yield* presentOne(turn),
      items: TurnLog.read(yield* TurnLog.entriesOf(log, turn)).items,
    } satisfies Turn.LogView;
  });

  const sameItem = Schema.toEquivalence(Turn.LogItem);
  const unavailable = () => new Turn.LogUnavailable({});

  const watchLog = Effect.fn("TurnApplication.watchLog")(function* (turnId: Turn.Id) {
    const id = yield* Schema.decodeEffect(Turn.Id)(turnId);
    // Register for drafts and commits before reading, so none that follows is missed: a change to
    // the reader's access committed after the read below is delivered, and rechecked.
    const live = yield* signals.subscribe;
    const committed = yield* commits.subscribe(Option.none()).pipe(Effect.mapError(unavailable));
    const turn = yield* readable(id);
    const handle = TurnLog.open(log, turn.participationId);
    // Following outlasts the request that opened it, so its access checks name the reader.
    const actor = yield* Actor.Service;
    /** The reader still may read the thread, or following ends. */
    const stillReadable = readableThread(turn.threadId).pipe(
      Effect.provideService(Actor.Service, actor),
      Effect.mapError(unavailable),
    );

    // The turn's entries sit together in its agent's log after `logAfter`, read as they come, and
    // end with its end: only one turn writes there at a time, so another turn's entry also means
    // this one's are over.
    const reader = TurnLog.reader();
    let after = turn.logAfter ?? undefined;
    let over = false;
    const take = (batches: ReadonlyArray<Log.Batch<TurnLog.Entry>>) => {
      for (const batch of batches) {
        for (const entry of batch.entries) {
          if (entry.payload.turnId !== turn.id) {
            over = true;
            return;
          }
          reader.add({ entry: entry.payload, at: entry.recordedAt, position: batch.position });
          if (entry.payload._tag === "Ended") over = true;
        }
        after = batch.position;
        if (over) return;
      }
    };
    /** Read what the log holds past what was taken, until the turn's entries are over. */
    const catchUp = Effect.gen(function* () {
      while (!over) {
        const batches = yield* handle.read(
          after === undefined ? { limit: logPage } : { after, limit: logPage },
        );
        if (batches.length === 0) return;
        take(batches);
      }
    });
    // The items as sent, so a change is told apart from what the reader has.
    let sent: ReadonlyArray<Turn.LogItem> = [];
    const changes = (): ReadonlyArray<Turn.LogChange> => {
      const items = reader.reading().items;
      const changed = items.flatMap((item, index) => {
        const before = sent[index];
        return before !== undefined && sameItem(before, item) ? [] : [{ index, item }];
      });
      sent = items;
      return changed;
    };
    const changed = (): ReadonlyArray<Turn.LogMessage> => {
      const list = changes();
      return list.length === 0 ? [] : [Turn.LogMessage.cases.Changed.make({ changes: list })];
    };
    const ended = Turn.LogMessage.cases.Ended.make({});

    yield* catchUp;
    sent = reader.reading().items;
    const opened = Turn.LogMessage.cases.Opened.make({ items: sent });
    if (over || !Turn.active(turn.status)) return Stream.make(opened, ended);
    // What the response being written holds so far, since drafts carry only what follows it.
    const written = (yield* drafts.current(turn.id)).map((draft) =>
      Turn.LogMessage.cases.Drafted.make({ ...draft, offset: 0 }),
    );

    type Input =
      | { readonly _tag: "Logged"; readonly batch: Log.Batch<TurnLog.Entry> }
      | { readonly _tag: "Drafted"; readonly draft: Turn.LogMessage }
      | { readonly _tag: "AccessChanged" };
    const logged = Stream.suspend(() =>
      handle.tail(after === undefined ? { limit: logPage } : { after, limit: logPage }),
    ).pipe(
      Stream.map((batch): Input => ({ _tag: "Logged", batch })),
      Stream.mapError(unavailable),
    );
    const drafted = live.pipe(
      Stream.filter(
        (signal): signal is Extract<Signal.Value, { readonly _tag: "TurnDraft" }> =>
          signal._tag === "TurnDraft" && signal.turnId === turn.id,
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
    const accessChanged = committed.deliveries.pipe(
      Stream.filter((delivery) =>
        delivery.events.some(
          ({ access }) =>
            access !== undefined &&
            (access.memberId === undefined || access.memberId === actor.memberId),
        ),
      ),
      Stream.map((): Input => ({ _tag: "AccessChanged" })),
      Stream.mapError(unavailable),
    );
    /**
     * What each input tells the reader, one at a time, so reads and what was sent agree. Once the
     * reader's access changes, it is checked before anything more is sent, drafts included.
     */
    const step = (
      input: Input,
    ): Effect.Effect<ReadonlyArray<Turn.LogMessage>, Turn.LogUnavailable> => {
      switch (input._tag) {
        case "Drafted":
          return Effect.succeed([input.draft]);
        case "AccessChanged":
          return Effect.as(stillReadable, []);
        case "Logged":
          return stillReadable.pipe(
            Effect.map(() => {
              take([input.batch]);
              // The turn's end is in its log, committed with everything it wrote.
              return over ? [...changed(), ended] : changed();
            }),
          );
      }
    };
    return Stream.make(opened, ...written).pipe(
      Stream.concat(
        Stream.mergeAll([logged, drafted, accessChanged], { concurrency: "unbounded" }).pipe(
          Stream.mapEffect(step),
          Stream.flattenIterable,
          Stream.takeUntil((message) => message._tag === "Ended"),
        ),
      ),
    );
  });

  const cancel = Effect.fn("TurnApplication.cancel")(
    function* (turnId: Turn.Id) {
      const turn = yield* readable(yield* Schema.decodeEffect(Turn.Id)(turnId));
      yield* authorization.require([directs(turn)]);
      if (!Turn.active(turn.status))
        return yield* new NotActive({ turnId: turn.id, status: turn.status });
      if (turn.status === "cancelling") return yield* presentOne(turn);
      const at = yield* DateTime.now;
      const where = {
        workspaceId,
        groupId: turn.groupId,
        threadId: turn.threadId,
        turnId: turn.id,
      };
      const requested = yield* journal.publish(
        TurnFacts.CancelRequested,
        Object.assign({}, where, { reason: "requested" as const, requestedAt: at }),
      );
      if (turn.status === "queued") {
        yield* ending.end(turn, { outcome: "cancelled", cancelReason: "requested" });
        return yield* presentOne(
          Turn.change(turn, { status: "cancelled", cancelReason: "requested", finishedAt: at }),
        );
      }
      yield* activity.record(
        turn.threadId,
        TurnActivity.Stopping,
        { turnId: turn.id, cancelReason: "requested" },
        requested,
      );
      return yield* presentOne(
        Turn.change(turn, { status: "cancelling", cancelReason: "requested" }),
      );
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const retry = Effect.fn("TurnApplication.retry")(
    function* (turnId: Turn.Id) {
      const id = yield* Schema.decodeEffect(Turn.Id)(turnId);
      const turn = yield* readable(id);
      yield* authorization.require([directs(turn)]);
      // A turn is retried at most once, since its retry supersedes it, so the retry's ID comes from
      // the turn it retries and asking again returns that retry.
      const retryId = Turn.Id.make(yield* Request.derivedId(["turn.retry", workspaceId, turn.id]));
      if (Option.isSome(yield* turns.get(retryId)))
        return yield* presentOne(yield* readable(retryId));
      const reason = yield* retryBlock(turn);
      if (reason !== undefined) return yield* new NotRetryable({ turnId: turn.id, reason });
      const handle = TurnLog.open(log, turn.participationId);
      // The same input, continuing after the failed or stopped turn in the agent's log: its
      // input starts after what that turn took in, from the latest checkpoint the log holds,
      // with the agent's current model access and environment. It is created after the turn
      // it retries, even on a clock that has not moved, so it is the agent's latest there.
      const retried = TurnLog.read(yield* TurnLog.entriesOf(log, turn));
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
      yield* activity.record(
        created.threadId,
        TurnActivity.Created,
        { turnId: created.id, memberId: created.memberId, retryOf: turn.id },
        event,
      );
      // Who asked is the retry's new input, after what the turn it retries left.
      const actor = yield* Actor.Service;
      const asker = yield* members.get(actor.memberId);
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
      return yield* presentOne(created);
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

export * as TurnApplication from "./application.ts";

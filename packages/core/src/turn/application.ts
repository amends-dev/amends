import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import type { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import type { Request } from "../request/request.ts";
import { RequestReceipts } from "../request/receipts.ts";
import { ThreadAccess } from "../thread/access.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { NotActive, NotFound, NotRetryable, ThreadNotFound } from "./errors.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";
export { NotActive, NotFound, NotRetryable, ThreadNotFound } from "./errors.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "TurnApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type ReadError =
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound>
  | Exclude<Authorization.Error, Authorization.Denied>
  | TurnStore.Failure
  | ThreadParticipationStore.Failure
  | Schema.SchemaError
  | InvalidResponse
  | NotFound;
export type ListError = Exclude<ReadError, NotFound> | ThreadNotFound;
export type ActiveError = Exclude<ReadError, NotFound>;
export type LogError = ReadError | Log.ReadError;
export type ChangeError =
  | ReadError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export type CancelError = ChangeError | NotActive;
export type RetryError = ChangeError | NotRetryable | RequestReceipts.Error;

export interface Interface {
  readonly workspaceId: Turn.Record["workspaceId"];
  /** A turn in a thread the reader may open; any other is NotFound. */
  readonly get: (turnId: Turn.Id) => Effect.Effect<Turn.View, ReadError, Actor.Service>;
  /** A thread's turns, newest first, at most `limit`, for a reader who may open the thread. */
  readonly listByThread: (
    threadId: ThreadId.Id,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Turn.View>, ListError, Actor.Service>;
  /**
   * The workspace's active turns in threads the reader may open, oldest first, among at most
   * `limit` active turns in the workspace.
   */
  readonly listActive: (
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Turn.View>, ActiveError, Actor.Service>;
  /** A turn with its log, for a reader who may open its thread. */
  readonly log: (turnId: Turn.Id) => Effect.Effect<Turn.LogView, LogError, Actor.Service>;
  /**
   * Ask an active turn to stop, for a reader who may open its thread and direct its agent. A
   * queued turn stops at once, since nothing runs it yet; a running one stops once execution
   * confirms it. A turn already stopping stays as it is; a finished one is NotActive.
   */
  readonly cancel: (turnId: Turn.Id) => Effect.Effect<Turn.View, CancelError, Actor.Service>;
  /**
   * Run a failed or stopped turn again, for a reader who may open its thread and direct its
   * agent: a new turn for the same agent and input, which runs with the agent's current
   * configuration. Only the agent's latest turn on the thread can be retried, while the agent
   * still takes part there; otherwise it is NotRetryable. A request key makes a retry of it
   * return the turn it created.
   */
  readonly retry: (
    turnId: Turn.Id,
    options?: Request.Options,
  ) => Effect.Effect<Turn.View, RetryError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/application/Service",
) {}

const RetryInput = Schema.Struct({ turnId: Turn.Id });
const RetryResult = Schema.Struct({ turnId: Turn.Id });

/** @category constructors */
export const make = Effect.fn("TurnApplication.make")(function* () {
  const turns = yield* TurnStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const access = yield* ThreadAccess.Service;
  const authorization = yield* Authorization.Service;
  const receipts = yield* RequestReceipts.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = turns.workspaceId;
  if (
    [
      participations.workspaceId,
      access.workspaceId,
      authorization.workspaceId,
      receipts.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({ message: "Turn services belong to different workspaces" });

  const decode = Schema.decodeEffect(Schema.toType(Turn.Record));
  /** The turn, when the reader may open its thread; otherwise it is missing to them. */
  const readable = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turns.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    const turn = yield* decode(found.value);
    if (turn.workspaceId !== workspaceId || turn.id !== turnId)
      return yield* new InvalidResponse({ message: "Turn store returned another turn" });
    yield* access
      .require(turn.threadId)
      .pipe(Effect.catchTag("ThreadAccess.NotFound", () => Effect.fail(new NotFound({ turnId }))));
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
    const thread = yield* access
      .require(id)
      .pipe(
        Effect.catchTag("ThreadAccess.NotFound", () =>
          Effect.fail(new ThreadNotFound({ threadId: id })),
        ),
      );
    const listed = yield* Effect.forEach(yield* turns.listByThread(thread.id, count), (turn) =>
      decode(turn),
    );
    return yield* present(listed, { newestFirst: true });
  });

  const bounded = Schema.decodeEffect(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  );

  const listActive = Effect.fn("TurnApplication.listActive")(function* (limit: number) {
    const active = yield* Effect.forEach(yield* turns.listActive(yield* bounded(limit)), (turn) =>
      decode(turn),
    );
    // Each thread's access is checked once, whatever number of its turns are active.
    const readable = new Map<string, boolean>();
    for (const turn of active) {
      if (readable.has(turn.threadId)) continue;
      const may = yield* access.require(turn.threadId).pipe(
        Effect.as(true),
        Effect.catchTags({
          "ThreadAccess.NotFound": () => Effect.succeed(false),
          "Authorization.Denied": () => Effect.succeed(false),
        }),
      );
      readable.set(turn.threadId, may);
    }
    return yield* present(active.filter((turn) => readable.get(turn.threadId) === true));
  });

  const readLog = Effect.fn("TurnApplication.log")(function* (turnId: Turn.Id) {
    const turn = yield* readable(yield* Schema.decodeEffect(Turn.Id)(turnId));
    const handle = TurnLog.open(log, turn.id);
    const items: Array<Turn.LogItem> = [];
    let after: Log.Position | undefined;
    for (;;) {
      const batches = yield* handle.read(
        after === undefined ? { limit: 100 } : { after, limit: 100 },
      );
      if (batches.length === 0) break;
      for (const batch of batches) {
        for (const entry of batch.entries) {
          const at = entry.recordedAt;
          const payload = entry.payload;
          if (payload._tag === "Interrupted")
            items.push({
              _tag: "Interrupted",
              at,
              reason: payload.reason,
              retryable: payload.retryable,
            });
          else if (payload._tag === "Harness") {
            const event = payload.event;
            if (event._tag === "InputIncorporated")
              items.push({ _tag: "InputTaken", at, messages: event.batch.items.length });
            else if (event._tag === "ResponseCompleted") {
              const text = event.response.parts
                .flatMap((part) => (part._tag === "Text" ? [part.text] : []))
                .join("");
              if (/\S/u.test(text))
                items.push({ _tag: "Responded", at, responseId: event.response.id, text });
            }
          }
        }
        after = batch.position;
      }
    }
    return { turn: yield* presentOne(turn), items } satisfies Turn.LogView;
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
      yield* journal.publish(
        TurnFacts.CancelRequested,
        Object.assign({}, where, { reason: "requested" as const, requestedAt: at }),
      );
      if (turn.status === "queued") {
        yield* journal.publish(TurnFacts.Cancelled, Object.assign({}, where, { finishedAt: at }));
        return yield* presentOne(
          Turn.change(turn, { status: "cancelled", cancelReason: "requested", finishedAt: at }),
        );
      }
      return yield* presentOne(
        Turn.change(turn, { status: "cancelling", cancelReason: "requested" }),
      );
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const retry = Effect.fn("TurnApplication.retry")(
    function* (turnId: Turn.Id, options: Request.Options = {}) {
      const id = yield* Schema.decodeEffect(Turn.Id)(turnId);
      const retried = yield* receipts.once(
        {
          operation: "turn.retry",
          key: options.requestKey,
          input: RetryInput,
          value: { turnId: id },
          result: RetryResult,
          resultOf: (created: Turn.Record) => ({ turnId: created.id }),
          restore: (result: { readonly turnId: Turn.Id }) => readable(result.turnId),
        },
        Effect.gen(function* () {
          const turn = yield* readable(id);
          yield* authorization.require([directs(turn)]);
          const reason = yield* retryBlock(turn);
          if (reason !== undefined) return yield* new NotRetryable({ turnId: turn.id, reason });
          // The same input, from where the failed or stopped turn began, with nothing taken in
          // and the agent's current model access and environment. It is created after the turn it
          // retries, even on a clock that has not moved, so it is the agent's latest there.
          const now = yield* DateTime.now;
          const createdAt = DateTime.isGreaterThan(now, turn.createdAt)
            ? now
            : DateTime.add(turn.createdAt, { milliseconds: 1 });
          const created: Turn.Record = {
            id: Turn.Id.make(yield* crypto.randomUUIDv4),
            workspaceId,
            groupId: turn.groupId,
            threadId: turn.threadId,
            agentId: turn.agentId,
            memberId: turn.memberId,
            participationId: turn.participationId,
            status: "queued",
            inputAfterSequence: turn.inputAfterSequence,
            acceptedThroughSequence: turn.acceptedThroughSequence,
            incorporatedThroughSequence: turn.inputAfterSequence,
            selection: null,
            messageId: null,
            failure: null,
            cancelReason: null,
            createdAt,
            startedAt: null,
            finishedAt: null,
          };
          yield* journal.publish(
            TurnFacts.Retried,
            Object.assign({}, created, { retryOf: turn.id }),
          );
          return created;
        }),
      );
      return yield* presentOne(retried);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({ workspaceId, get, listByThread, listActive, log: readLog, cancel, retry });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnApplication from "./application.ts";

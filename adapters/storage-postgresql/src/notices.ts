/**
 * Notices between pools over one channel: commits that append to a log, so waiting readers look
 * again, and ephemeral signals, relayed to subscribers in every process. A commit notifies inside
 * its transaction, so PostgreSQL delivers that notice only once the commit succeeds. One listener
 * per pool, on one connection, dispatches both.
 */
import { PgClient } from "@effect/sql-pg";
import type { Entry } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Deferred, Duration, Effect, Queue, RcRef } from "effect";
import type { Scope } from "effect";

/** The channel every notice uses. */
export const channel = "amends_notices";

/** The notice a commit sends for each log it appended to. */
export const appendNotice = (workspaceId: Workspace.Id, logId: Entry.LogId): string =>
  JSON.stringify(["append", workspaceId, logId]);

const signalNotice = (workspaceId: Workspace.Id, signal: unknown): string =>
  JSON.stringify(["signal", workspaceId, signal]);

/** A notice's kind, workspace, and subject, or undefined for one this version does not know. */
const parse = (payload: string) => {
  try {
    const value: unknown = JSON.parse(payload);
    if (
      Array.isArray(value) &&
      value.length === 3 &&
      (value[0] === "append" || value[0] === "signal") &&
      typeof value[1] === "string"
    )
      return { kind: value[0] as "append" | "signal", workspaceId: value[1], subject: value[2] };
  } catch {
    // An unreadable notice wakes nobody.
  }
  return undefined;
};

export interface Interface {
  /**
   * Keep this pool listening for the caller's scope. The first lease waits for PostgreSQL to
   * confirm `LISTEN`, briefly, so an append right after the caller's first check still wakes
   * it; the listener stops a while after the last lease closes.
   */
  readonly listening: Effect.Effect<void, never, Scope.Scope>;
  /**
   * The signal for this log's next append. It also completes whenever the listener connects,
   * since notices sent while it was not listening are lost. Take it before checking the log, so
   * an append between the check and the wait still wakes the caller. Hold a `listening` lease
   * while waiting.
   */
  readonly next: (workspaceId: Workspace.Id, logId: Entry.LogId) => Deferred.Deferred<void>;
  /** Relay an encoded signal to the workspace's subscribers in every pool, best effort. */
  readonly signal: (workspaceId: Workspace.Id, encoded: unknown) => Effect.Effect<void>;
  /**
   * The encoded signals relayed for a workspace from now until the scope closes, in a bounded
   * queue that drops the oldest when the subscriber falls behind. Keeps the pool listening.
   */
  readonly signals: (
    workspaceId: Workspace.Id,
  ) => Effect.Effect<Queue.Dequeue<unknown>, never, Scope.Scope>;
}

export interface Options {
  /** How long to wait before listening again after the listener's connection fails. */
  readonly retry?: Duration.Input | undefined;
}

/** Signals a subscriber may fall behind by before it misses the oldest. */
const capacity = 256;

/**
 * Construct the notice router and its listener over the pool's client.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresNotices.make")(function* (options: Options = {}) {
  const client = yield* PgClient.PgClient;
  const retry = Duration.fromInputUnsafe(options.retry ?? "1 second");
  const waiting = new Map<string, Deferred.Deferred<void>>();
  const subscribers = new Map<string, Set<Queue.Queue<unknown>>>();
  const wake = (key: string) => {
    const signal = waiting.get(key);
    if (signal === undefined) return;
    waiting.delete(key);
    Deferred.doneUnsafe(signal, Effect.void);
  };
  const wakeAll = () => {
    for (const key of waiting.keys()) wake(key);
  };
  const dispatch = (payload: string) => {
    const notice = parse(payload);
    if (notice === undefined) return Effect.void;
    if (notice.kind === "append") {
      wake(payload);
      return Effect.void;
    }
    return Effect.forEach(subscribers.get(notice.workspaceId) ?? [], (queue) =>
      Queue.offer(queue, notice.subject),
    );
  };

  const listen = (ready: Deferred.Deferred<void>) =>
    Effect.gen(function* () {
      const notices = yield* client.listen(channel);
      // Appends made while not listening sent notices nobody received.
      wakeAll();
      yield* Deferred.succeed(ready, undefined);
      while (true) yield* dispatch((yield* Queue.take(notices)).payload);
    }).pipe(
      Effect.scoped,
      Effect.exit,
      // Waiters keep waiting: listening again wakes them to re-check what they missed meanwhile.
      Effect.tap((exit) =>
        Effect.andThen(
          Deferred.succeed(ready, undefined),
          Effect.logWarning("Notice listener stopped; listening again", exit),
        ),
      ),
      Effect.andThen(Effect.sleep(retry)),
      Effect.forever,
    );

  const listener = yield* RcRef.make({
    acquire: Effect.gen(function* () {
      const ready = yield* Deferred.make<void>();
      yield* Effect.forkScoped(listen(ready));
      yield* Deferred.await(ready).pipe(Effect.timeout("5 seconds"), Effect.ignore);
    }),
    idleTimeToLive: "30 seconds",
  });
  const listening = RcRef.get(listener);

  const next = (workspaceId: Workspace.Id, logId: Entry.LogId) => {
    const key = appendNotice(workspaceId, logId);
    const existing = waiting.get(key);
    if (existing !== undefined) return existing;
    const signal = Deferred.makeUnsafe<void>();
    waiting.set(key, signal);
    return signal;
  };

  const signal = (workspaceId: Workspace.Id, encoded: unknown) =>
    client
      .notify(channel, signalNotice(workspaceId, encoded))
      .pipe(Effect.catchCause((cause) => Effect.logWarning("Signal not relayed", cause)));

  const signals = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
    yield* listening;
    const queue = yield* Queue.sliding<unknown>(capacity);
    const set = subscribers.get(workspaceId) ?? new Set();
    set.add(queue);
    subscribers.set(workspaceId, set);
    yield* Effect.addFinalizer(() =>
      Effect.suspend(() => {
        set.delete(queue);
        if (set.size === 0) subscribers.delete(workspaceId);
        return Queue.shutdown(queue);
      }),
    );
    return queue;
  });

  return { listening, next, signal, signals } satisfies Interface;
});

export * as PostgresNotices from "./notices.ts";

/**
 * Wakeups for readers waiting on a log. A commit that appends notifies this channel inside its
 * transaction, so PostgreSQL delivers the notification only once the commit succeeds. One
 * listener per pool fans notifications out to the waiters in this process.
 */
import { PgClient } from "@effect/sql-pg";
import type { Entry } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Deferred, Duration, Effect, Queue, RcRef } from "effect";
import type { Scope } from "effect";

/** The channel every appending commit notifies. */
export const channel = "amends_log_appends";

/** The notification payload that names one workspace's log. */
export const payloadOf = (workspaceId: Workspace.Id, logId: Entry.LogId): string =>
  JSON.stringify([workspaceId, logId]);

export interface Interface {
  /**
   * Keep this pool listening for the caller's scope. The first lease waits for PostgreSQL to
   * confirm `LISTEN`, briefly, so an append right after the caller's first check still wakes
   * it; the listener stops a while after the last lease closes.
   */
  readonly listening: Effect.Effect<void, never, Scope.Scope>;
  /**
   * The signal for this log's next append. It also completes whenever the listener connects,
   * since notifications sent while it was not listening are lost. Take it before checking the
   * log, so an append between the check and the wait still wakes the caller. Hold a
   * `listening` lease while waiting.
   */
  readonly next: (workspaceId: Workspace.Id, logId: Entry.LogId) => Deferred.Deferred<void>;
}

export interface Options {
  /** How long to wait before listening again after the listener's connection fails. */
  readonly retry?: Duration.Input | undefined;
}

/**
 * Construct the waiters' registry and its listener over the pool's client.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresAppends.make")(function* (options: Options = {}) {
  const client = yield* PgClient.PgClient;
  const retry = Duration.fromInputUnsafe(options.retry ?? "1 second");
  const waiting = new Map<string, Deferred.Deferred<void>>();
  const wake = (key: string) => {
    const signal = waiting.get(key);
    if (signal === undefined) return;
    waiting.delete(key);
    Deferred.doneUnsafe(signal, Effect.void);
  };
  const wakeAll = () => {
    for (const key of waiting.keys()) wake(key);
  };

  const listen = (ready: Deferred.Deferred<void>) =>
    Effect.gen(function* () {
      const notifications = yield* client.listen(channel);
      // Appends made while not listening sent notifications nobody received.
      wakeAll();
      yield* Deferred.succeed(ready, undefined);
      while (true) wake((yield* Queue.take(notifications)).payload);
    }).pipe(
      Effect.scoped,
      Effect.exit,
      // Waiters keep waiting: listening again wakes them to re-check what they missed meanwhile.
      Effect.tap((exit) =>
        Effect.andThen(
          Deferred.succeed(ready, undefined),
          Effect.logWarning("Log append listener stopped; listening again", exit),
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

  const next = (workspaceId: Workspace.Id, logId: Entry.LogId) => {
    const key = payloadOf(workspaceId, logId);
    const existing = waiting.get(key);
    if (existing !== undefined) return existing;
    const signal = Deferred.makeUnsafe<void>();
    waiting.set(key, signal);
    return signal;
  };

  return { listening: RcRef.get(listener), next } satisfies Interface;
});

export * as PostgresAppends from "./appends.ts";

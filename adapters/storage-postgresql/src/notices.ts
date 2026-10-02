/**
 * Notices between pools over one channel: commits that append to a log, so waiting readers look
 * again, and signals, published to subscribers in every process. A commit notifies right after
 * COMMIT succeeds, on its own connection, rather than inside its transaction, where the
 * notification lock would serialize every notifying commit on the server; a notice lost between
 * the two leaves readers to their poll. One listener per pool, on one connection, routes both.
 */
import { PgClient } from "@effect/sql-pg";
import type { Entry } from "@amends/core/journal";
import { Signal, SignalHub } from "@amends/core/signal";
import type { Workspace } from "@amends/core/workspace";
import { Deferred, Duration, Effect, Option, Queue, RcRef, Schema, Stream } from "effect";
import type { Scope } from "effect";

/** The channel every notice uses. */
export const channel = "amends_notices";

/** The notice a commit sends for each log it appended to. */
export const appendNotice = (workspaceId: Workspace.Id, logId: Entry.LogId): string =>
  JSON.stringify(["append", workspaceId, logId]);

const signalCodec = Schema.toCodecJson(Signal.Value);
const encodeSignal = Schema.encodeEffect(signalCodec);
const decodeSignal = Schema.decodeUnknownEffect(signalCodec);

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
   * Completes at this log's next append. It also completes whenever the listener connects, since
   * notices sent while it was not listening are lost. Take it before checking the log, so an
   * append between the check and the wait still wakes the caller. Hold a `listening` lease while
   * waiting.
   */
  readonly nextAppend: (workspaceId: Workspace.Id, logId: Entry.LogId) => Deferred.Deferred<void>;
  /** Publish a signal to its workspace's subscribers in every pool, best effort. */
  readonly publishSignal: (signal: Signal.Value) => Effect.Effect<void>;
  /**
   * A workspace's signals from every pool, from now until the scope closes; a subscriber that
   * falls behind misses the oldest. Keeps the pool listening.
   */
  readonly subscribeSignals: (
    workspaceId: Workspace.Id,
  ) => Effect.Effect<Stream.Stream<Signal.Value>, never, Scope.Scope>;
}

export interface Options {
  /** How long to wait before listening again after the listener's connection fails. */
  readonly retry?: Duration.Input | undefined;
}

/**
 * Construct the notice router and its listener over the pool's client.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresNotices.make")(function* (options: Options = {}) {
  const client = yield* PgClient.PgClient;
  const retry = Duration.fromInputUnsafe(options.retry ?? "1 second");
  const waiting = new Map<string, Deferred.Deferred<void>>();
  const signals = yield* SignalHub.makeLocal;
  const wake = (key: string) => {
    const appended = waiting.get(key);
    if (appended === undefined) return;
    waiting.delete(key);
    Deferred.doneUnsafe(appended, Effect.void);
  };
  const wakeAll = () => {
    for (const key of waiting.keys()) wake(key);
  };
  const route = (payload: string) => {
    const notice = parse(payload);
    if (notice === undefined) return Effect.void;
    if (notice.kind === "append") {
      wake(payload);
      return Effect.void;
    }
    // A signal this version cannot read is skipped.
    return decodeSignal(notice.subject).pipe(
      Effect.option,
      Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: signals.publish })),
    );
  };

  const listen = (ready: Deferred.Deferred<void>) =>
    Effect.gen(function* () {
      const notices = yield* client.listen(channel);
      // Appends made while not listening sent notices nobody received.
      wakeAll();
      yield* Deferred.succeed(ready, undefined);
      while (true) yield* route((yield* Queue.take(notices)).payload);
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

  const nextAppend = (workspaceId: Workspace.Id, logId: Entry.LogId) => {
    const key = appendNotice(workspaceId, logId);
    const existing = waiting.get(key);
    if (existing !== undefined) return existing;
    const appended = Deferred.makeUnsafe<void>();
    waiting.set(key, appended);
    return appended;
  };

  const publishSignal = (signal: Signal.Value) =>
    encodeSignal(signal).pipe(
      Effect.flatMap((encoded) =>
        client.notify(channel, JSON.stringify(["signal", signal.workspaceId, encoded])),
      ),
      Effect.catchCause((cause) => Effect.logWarning("Signal not published", cause)),
    );

  const subscribeSignals = (workspaceId: Workspace.Id) =>
    Effect.andThen(listening, signals.subscribe(workspaceId));

  return { listening, nextAppend, publishSignal, subscribeSignals } satisfies Interface;
});

export * as PostgresNotices from "./notices.ts";

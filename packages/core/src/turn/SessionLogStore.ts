/**
 * The storage contract for session logs, which every storage adapter implements and a turn's job
 * writes: one append-only log for each participation in the workspace, whose entries
 * `SessionLog.Entry` describes. Logs take part in no commit, so a host may keep them apart from
 * its other stores, in one built for appending, and nothing here needs a transaction. A log's
 * first entry is at position 1, and each next one follows it.
 *
 * @since 0.1.0
 */
import { Array, Context, DateTime, Deferred, Effect, Layer, Schema } from "effect";
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts";
import * as SessionLog from "./SessionLog.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as Store from "../journal/Store.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";

/**
 * Storage failed while reading or writing session logs.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("SessionLogStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * The log holds an entry past where its writer read it to: someone else wrote there meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("SessionLogStore.Conflict", {
  participationId: Schema.String,
  after: Schema.Int,
}) {}

/**
 * A page of a log: its entries past `after`, at most `limit` of them.
 *
 * @category options
 * @since 0.1.0
 */
export const ReadOptions = Schema.Struct({
  after: Schema.Natural,
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * The session log store, bound to one workspace by the host: what a storage adapter implements
 * for session logs.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema before the driver sees it, so a driver keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class SessionLogStore extends Context.Service<
  SessionLogStore,
  {
    /** The position of the log's latest entry, or 0 while it has none. */
    readonly head: (participationId: ThreadParticipationId.Id) => Effect.Effect<number, Failure>;
    /**
     * Append `entries` in order after the entry at `after`, the log's latest as the writer read it,
     * or 0 for an empty log. A log that holds an entry past `after` takes none of them and fails with
     * Conflict, so a writer that fell behind, as one another replaced has, cannot write past it.
     */
    readonly append: (
      participationId: ThreadParticipationId.Id,
      entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>,
      after: number,
    ) => Effect.Effect<Array.NonEmptyReadonlyArray<SessionLog.Recorded>, Failure | Conflict>;
    /** The log's entries past `after`, oldest first, at most `limit` of them. */
    readonly read: (
      participationId: ThreadParticipationId.Id,
      options: ReadOptions,
    ) => Effect.Effect<ReadonlyArray<SessionLog.Recorded>, Failure>;
    /** Completes once the log holds an entry past `after`. */
    readonly waitForAppend: (
      participationId: ThreadParticipationId.Id,
      after: number,
    ) => Effect.Effect<void, Failure>;
  }
>()("@amends-dev/core/turn/SessionLogStore") {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: SessionLogStore["Service"],
): SessionLogStore["Service"] => {
  const read = StoreInput.read(Failure);
  return {
    head: (participationId) =>
      Effect.flatMap(read("head", ThreadParticipationId.Id, participationId), driver.head),
    append: Effect.fn("SessionLogStore.append")(function* (participationId, entries, after) {
      return yield* driver.append(
        yield* read("append", ThreadParticipationId.Id, participationId),
        yield* read("append", Schema.NonEmptyArray(SessionLog.Entry), entries),
        yield* read("append", Schema.Natural, after),
      );
    }),
    read: Effect.fn("SessionLogStore.read")(function* (participationId, options) {
      return yield* driver.read(
        yield* read("read", ThreadParticipationId.Id, participationId),
        yield* read("read", ReadOptions, options),
      );
    }),
    waitForAppend: Effect.fn("SessionLogStore.waitForAppend")(function* (participationId, after) {
      return yield* driver.waitForAppend(
        yield* read("waitForAppend", ThreadParticipationId.Id, participationId),
        yield* read("waitForAppend", Schema.Natural, after),
      );
    }),
  };
};

/** An entry as JSON, where and when its log recorded it. */
const rows = MemoryDatabase.makeRows(
  Schema.fromJsonString(Schema.toCodecJson(SessionLog.Recorded)),
);

/**
 * Each participation's session log in memory, beside the workspace's transactional state: an
 * append takes part in no transaction and is kept at once.
 */
const makeMemory = Effect.fn("SessionLogStore.makeMemory")(function* () {
  const { workspaceId, connection } = yield* Store.MemoryBinding;
  const { database } = connection;
  const logKeyOf = (participationId: string) => MemoryDatabase.keyOf(workspaceId, participationId);
  const logOf = (participationId: string) =>
    database.sessionLogs.get(logKeyOf(participationId)) ?? [];
  const driver: SessionLogStore["Service"] = {
    head: (participationId) => Effect.sync(() => logOf(participationId).length),
    append: Effect.fn("SessionLogStore.memory.append")(function* (participationId, entries, after) {
      const log = logOf(participationId);
      if (log.length !== after) return yield* new Conflict({ participationId, after });
      const recordedAt = yield* DateTime.now;
      const recorded = Array.map(entries, (entry, index) => ({
        position: after + index + 1,
        recordedAt,
        entry,
      }));
      const encoded = yield* Effect.forEach(recorded, (entry) => rows.encode(entry)).pipe(
        Effect.mapError(storeFailure(Failure, "append")),
      );
      database.sessionLogs.set(logKeyOf(participationId), [...log, ...encoded]);
      MemoryDatabase.wakeAppendReaders(database);
      return recorded;
    }),
    read: Effect.fn("SessionLogStore.memory.read")(
      function* (participationId, { after, limit }) {
        const page = logOf(participationId).slice(Math.max(after, 0), Math.max(after, 0) + limit);
        return yield* Effect.forEach(page, (row) => rows.decode(row));
      },
      Effect.mapError(storeFailure(Failure, "read")),
    ),
    waitForAppend: Effect.fn("SessionLogStore.memory.waitForAppend")(
      function* (participationId, after) {
        while (true) {
          // Take the signal before checking the log, so no append falls between the two.
          const appended = database.appended;
          if (logOf(participationId).length > after) return;
          yield* Deferred.await(appended);
        }
      },
    ),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `SessionLogStore` in process memory, over the workspace's `Store.MemoryBinding`: each
 * participation's session log, kept in `MemoryDatabase` beside the workspaces' state. An append
 * takes part in no transaction: it is kept at once and wakes waiting readers. It keeps what the
 * contract leaves to storage: an append conflicts unless the log ends where its writer read it to.
 * `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(SessionLogStore, makeMemory());

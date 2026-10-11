/**
 * The memory implementation of `SessionLogStore` from `../turn/SessionLogStore.ts`, over the
 * workspace's `Binding`: each participation's session log, kept in `MemoryDatabase` beside the
 * workspaces' state. An append takes part in no transaction: it is kept at once and wakes waiting
 * readers. It keeps what the contract leaves to storage: an append conflicts unless the log ends
 * where its writer read it to. `SessionLogStore.make` checks every input before this driver sees
 * it.
 *
 * @since 0.1.0
 */
import { SessionLog, SessionLogStore } from "../turn/index.ts";
import { Array, DateTime, Deferred, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import * as MemoryDatabase from "./MemoryDatabase.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

/** An entry as JSON, where and when its log recorded it. */
const rows = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SessionLog.Recorded)));

/**
 * Each participation's session log in memory, beside the workspace's transactional state: an
 * append takes part in no transaction and is kept at once.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("SessionLogs.make")(function* () {
  const { workspaceId, connection } = yield* Binding.Binding;
  const { database } = connection;
  const keyOf = (participationId: string) => Rows.keyOf(workspaceId, participationId);
  const logOf = (participationId: string) => database.sessionLogs.get(keyOf(participationId)) ?? [];
  const driver: SessionLogStore.SessionLogStore["Service"] = {
    head: (participationId) => Effect.sync(() => logOf(participationId).length),
    append: Effect.fn("SessionLogs.append")(function* (participationId, entries, after) {
      const log = logOf(participationId);
      if (log.length !== after)
        return yield* new SessionLogStore.Conflict({ participationId, after });
      const recordedAt = yield* DateTime.now;
      const recorded = Array.map(entries, (entry, index) => ({
        position: after + index + 1,
        recordedAt,
        entry,
      }));
      const encoded = yield* Effect.forEach(recorded, (entry) => rows.encode(entry)).pipe(
        Effect.mapError(storeFailure(SessionLogStore, "append")),
      );
      database.sessionLogs.set(keyOf(participationId), [...log, ...encoded]);
      MemoryDatabase.wakeAppendReaders(database);
      return recorded;
    }),
    read: Effect.fn("SessionLogs.read")(
      function* (participationId, { after, limit }) {
        const page = logOf(participationId).slice(Math.max(after, 0), Math.max(after, 0) + limit);
        return yield* Effect.forEach(page, (row) => rows.decode(row));
      },
      Effect.mapError(storeFailure(SessionLogStore, "read")),
    ),
    waitForAppend: Effect.fn("SessionLogs.waitForAppend")(function* (participationId, after) {
      while (true) {
        // Take the signal before checking the log, so no append falls between the two.
        const appended = database.appended;
        if (logOf(participationId).length > after) return;
        yield* Deferred.await(appended);
      }
    }),
  };
  return SessionLogStore.make(workspaceId, driver);
});

/**
 * Provide session logs over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(SessionLogStore.SessionLogStore, make());

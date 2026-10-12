/**
 * The PostgreSQL driver for `SessionLogStore.SessionLogStore`, over the `session_log_entries`
 * table: each participation's session log, keyed by position, with each entry's kind and turn in
 * columns and the rest of it in `details` as JSON. The log takes part in no commit, so its
 * statements run apart from any transaction the caller is in, each on its own, and rebuilds keep
 * it. `SessionLogStore.make` checks every input before the driver sees it, so the driver keeps
 * only what storage keeps: an append checks the log's latest position, the key refuses a position
 * taken meanwhile, each as the store's `Conflict`, and it then notifies readers waiting through
 * `PostgresNotices`, in every process. Every statement is scoped to the binding's workspace and
 * runs under its `guard`.
 *
 * @since 0.1.0
 */
import { Store } from "@amends-dev/core/journal";
import { SessionLog, SessionLogStore } from "@amends-dev/core/turn";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { Array, Context, DateTime, Deferred, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { isConstraintViolation, storeFailure } from "./internal/errors.ts";
import * as PostgresNotices from "./PostgresNotices.ts";
import { sessionLogEntries } from "./internal/schema.ts";

const EntryJson = Schema.toCodecJson(SessionLog.Entry);
const encodeEntry = Schema.encodeEffect(EntryJson);
const decodeRecorded = Schema.decodeUnknownEffect(
  Schema.Struct({
    position: SessionLog.Position,
    recordedAt: Schema.DateTimeUtcFromDate,
    entry: EntryJson,
  }),
);

type Row = typeof sessionLogEntries.$inferSelect;

/** An entry's columns: its kind, its turn, and the rest of its fields as `details`. */
const columnsOf = Effect.fnUntraced(function* (entry: SessionLog.Entry) {
  // Every entry encodes to an object with its kind, and all but the conversation joined its turn.
  const encoded = (yield* encodeEntry(entry)) as {
    readonly _tag: SessionLog.Entry["_tag"];
    readonly turnId?: string;
  };
  const { _tag: kind, turnId, ...details } = encoded;
  return { kind, turnId: turnId ?? null, details };
});

/** The entry a row records, before its fields are checked. */
const recordedOf = ({ position, recordedAt, kind, turnId, details }: Row) => ({
  position,
  recordedAt,
  entry: Object.assign({ _tag: kind }, turnId === null ? {} : { turnId }, details),
});

/**
 * Each participation's session log in the workspace's database. Its statements run apart from any
 * commit the caller is in, each on its own, since the log takes part in none.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("SessionLogs.make")(function* () {
  const { workspaceId, database, guard, pollInterval } = yield* Binding.Binding;
  const { db, notices } = database;
  /** Run a statement outside the caller's transaction, if any. */
  const apart = <A, E>(statement: Effect.Effect<A, E>) =>
    Effect.updateContext(guard(statement), (context: Context.Context<never>) =>
      Context.omit(
        database.sql.transactionService,
        Binding.CurrentTransaction,
        Store.Transaction,
      )(context),
    );
  const ofLog = (participationId: string) =>
    and(
      eq(sessionLogEntries.workspaceId, workspaceId),
      eq(sessionLogEntries.participationId, participationId),
    );
  const readHead = (participationId: string) =>
    apart(
      db
        .select({ head: max(sessionLogEntries.position) })
        .from(sessionLogEntries)
        .where(ofLog(participationId)),
    ).pipe(
      Effect.map((rows) => rows[0]?.head ?? 0),
      Effect.mapError(storeFailure(SessionLogStore, "head")),
    );
  const driver: SessionLogStore.SessionLogStore["Service"] = {
    head: readHead,
    append: Effect.fn("SessionLogs.append")(function* (participationId, entries, after) {
      const conflict = new SessionLogStore.Conflict({ participationId, after });
      if ((yield* readHead(participationId)) !== after) return yield* conflict;
      const recordedAt = yield* DateTime.now;
      const recorded = Array.map(entries, (entry, index) => ({
        position: after + index + 1,
        recordedAt,
        entry,
      }));
      const rows = yield* Effect.forEach(recorded, ({ position, entry }) =>
        Effect.map(columnsOf(entry), (columns) =>
          Object.assign(
            { workspaceId, participationId, position, recordedAt: DateTime.toDate(recordedAt) },
            columns,
          ),
        ),
      ).pipe(Effect.mapError(storeFailure(SessionLogStore, "append")));
      // Another writer taking a position first makes the insert, one statement, take none.
      yield* apart(db.insert(sessionLogEntries).values(rows)).pipe(
        Effect.mapError((cause) =>
          isConstraintViolation(cause)
            ? conflict
            : new SessionLogStore.Failure({ operation: "append", cause }),
        ),
      );
      yield* notices.notifyAppend(workspaceId, PostgresNotices.sessionLogKey(participationId));
      return recorded;
    }),
    read: Effect.fn("SessionLogs.read")(
      function* (participationId, { after, limit }) {
        const rows = yield* apart(
          db
            .select()
            .from(sessionLogEntries)
            .where(and(ofLog(participationId), gt(sessionLogEntries.position, after)))
            .orderBy(asc(sessionLogEntries.position))
            .limit(limit),
        );
        return yield* Effect.forEach(rows, (row) => decodeRecorded(recordedOf(row)));
      },
      Effect.mapError(storeFailure(SessionLogStore, "read")),
    ),
    waitForAppend: Effect.fn("SessionLogs.waitForAppend")(function* (participationId, after) {
      // What is stored is the truth, so other processes' appends are seen; notices only say when
      // to look again, and the interval covers any that are lost.
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* notices.listening;
          while (true) {
            const nextAppend = notices.nextAppend(
              workspaceId,
              PostgresNotices.sessionLogKey(participationId),
            );
            if ((yield* readHead(participationId)) > after) return;
            yield* Deferred.await(nextAppend).pipe(Effect.timeoutOption(pollInterval));
          }
        }),
      );
    }),
  };
  return SessionLogStore.make(workspaceId, driver);
});

/**
 * Provides `SessionLogStore.SessionLogStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(SessionLogStore.SessionLogStore, make());

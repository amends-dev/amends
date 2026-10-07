import { Store } from "@amends/core/journal";
import { SessionLog, SessionLogStore } from "@amends/core/turn";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { Array, Context, DateTime, Deferred, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { isConstraintViolation, storeFailure } from "./errors.ts";
import { PostgresNotices } from "./notices.ts";
import { sessionLogEntries } from "./schema.ts";

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
 */
export const make = Effect.fn("SessionLogs.make")(function* () {
  const { workspaceId, database, guard, pollInterval } = yield* Binding.Service;
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
  return SessionLogStore.Service.of({
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
  });
});

/** Provide session logs over the caller's binding. @category layers */
export const layer = Layer.effect(SessionLogStore.Service, make());

export * as SessionLogs from "./session-logs.ts";

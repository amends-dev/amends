import { Checkpoint, Commit, Entry, Store, Workspace } from "@amends/core";
import { Array, Cause, Context, DateTime, Effect, Exit, Option, Schema, Schedule } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";

interface Session {
  readonly owner: SqlClient.SqlClient;
  readonly workspaceId: Workspace.Id;
  readonly commit: Commit.Record;
  active: boolean;
}
class Current extends Context.Service<Current, Session>()("@amends/host-local/storage/Current") {}

const failure = (operation: string) => (cause: unknown) => new Store.Failure({ operation, cause });
const transactionError = (cause: SqlError.SqlError) =>
  cause.reason._tag === "LockTimeoutError" || cause.reason._tag === "SerializationError"
    ? new Store.Conflict({ operation: "transaction", message: cause.message })
    : failure("transaction")(cause);

/**
 * A bound view fences workspace and transaction handles even when the SQL client
 * is shared. Every SQL path includes workspace_id; log IDs are local to a workspace.
 */
export const make = Effect.fn("SqliteJournal.make")(function* (
  workspaceId: Workspace.Id,
  health: { broken: boolean },
) {
  const sql = yield* SqlClient.SqlClient;
  const check = Effect.fnUntraced(function* (write = false) {
    if (health.broken)
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Connection requires reopening after a failed transaction cleanup",
      });
    const current = yield* Effect.serviceOption(Current);
    const native = yield* Effect.serviceOption(Store.Transaction);
    const connection = yield* Effect.serviceOption(sql.transactionService);
    if (Option.isNone(current) && Option.isNone(native) && Option.isNone(connection) && !write)
      return;
    if (
      Option.isNone(current) ||
      Option.isNone(native) ||
      Option.isNone(connection) ||
      !current.value.active ||
      current.value.owner !== sql ||
      current.value.workspaceId !== workspaceId ||
      current.value.commit.id !== native.value.id
    ) {
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Missing, closed, or foreign workspace transaction",
      });
    }
  });
  const guard = <A, E, R>(program: Effect.Effect<A, E, R>, write = false) =>
    check(write).pipe(Effect.andThen(program));
  const entries = Effect.fnUntraced(function* (logId: Entry.LogId, commitId: Commit.Id) {
    return yield* sql`SELECT id, log_id AS logId, position, commit_id AS commitId, entry_index AS "index", recorded_at AS recordedAt, payload FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${logId} AND commit_id = ${commitId} ORDER BY entry_index`.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Entry.Record))),
    );
  });
  const Headers = Schema.Array(
    Schema.Struct({
      logId: Entry.LogId,
      position: Entry.Position,
      id: Commit.Id,
      recordedAt: Schema.DateTimeUtcFromString,
      entryCount: Schema.Natural,
    }),
  );
  const batches = Effect.fnUntraced(function* (
    query: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>,
  ) {
    const headers = yield* query.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Headers)));
    return yield* Effect.forEach(
      headers,
      Effect.fnUntraced(function* (row): Effect.fn.Return<
        Store.Batch,
        SqlError.SqlError | Schema.SchemaError | Store.Failure
      > {
        const values = yield* entries(row.logId, row.id);
        if (!Array.isReadonlyArrayNonEmpty(values))
          return yield* new Store.Failure({
            operation: "read",
            cause: "Log batch without entries",
          });
        return {
          logId: row.logId,
          position: row.position,
          commit: { id: row.id, recordedAt: row.recordedAt, entryCount: row.entryCount },
          entries: values,
        };
      }),
    );
  });
  const append = Effect.fn("SqliteJournal.append")(function* (
    session: Session,
    request: Store.Append,
  ) {
    yield* check(true);
    const current = yield* Effect.serviceOption(Current);
    if (!session.active || Option.isNone(current) || current.value !== session)
      return yield* new Store.Failure({
        operation: "append",
        cause: "Closed or foreign append handle",
      });
    const last =
      yield* sql`SELECT position, commit_id AS commitId FROM log_batches WHERE workspace_id = ${workspaceId} AND log_id = ${request.logId} ORDER BY position DESC LIMIT 1`.pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ position: Entry.Position, commitId: Commit.Id })),
          ),
        ),
        Effect.map(Array.head),
        Effect.mapError(failure("append")),
      );
    if (request.expectedAfter !== undefined) {
      const actual = Option.map(last, (value) => value.position);
      if (!Option.makeEquivalence<number>((a, b) => a === b)(actual, request.expectedAfter))
        return yield* new Store.Conflict({
          operation: "append",
          message: "Expected log position changed",
        });
    }
    if (request.payloads.length === 0) return [];
    const extending = Option.isSome(last) && last.value.commitId === session.commit.id;
    const position = Entry.Position.make(
      Option.isNone(last) ? 0 : last.value.position + (extending ? 0 : 1),
    );
    const count = extending
      ? (yield* entries(request.logId, session.commit.id).pipe(Effect.mapError(failure("append"))))
          .length
      : 0;
    const recordedAt = yield* DateTime.now;
    yield* sql`INSERT INTO commits (workspace_id, id, recorded_at, entry_count) VALUES (${workspaceId}, ${session.commit.id}, ${DateTime.formatIso(session.commit.recordedAt)}, 0) ON CONFLICT DO NOTHING`.pipe(
      Effect.mapError(failure("append")),
    );
    if (!extending)
      yield* sql`INSERT INTO log_batches VALUES (${workspaceId}, ${request.logId}, ${position}, ${session.commit.id})`.pipe(
        Effect.mapError(failure("append")),
      );
    const result: Array<Entry.Record> = [];
    for (const [offset, payload] of request.payloads.entries()) {
      const id = Entry.Id.make(crypto.randomUUID());
      const index = count + offset;
      yield* sql`INSERT INTO log_entries VALUES (${workspaceId}, ${id}, ${request.logId}, ${position}, ${session.commit.id}, ${index}, ${DateTime.formatIso(recordedAt)}, ${payload})`.pipe(
        Effect.mapError(failure("append")),
      );
      result.push({
        id,
        logId: request.logId,
        position,
        commitId: session.commit.id,
        index,
        recordedAt,
        payload: payload.slice(),
      });
    }
    yield* sql`UPDATE commits SET entry_count = entry_count + ${result.length} WHERE workspace_id = ${workspaceId} AND id = ${session.commit.id}`.pipe(
      Effect.mapError(failure("append")),
    );
    return result;
  });

  const transaction = Effect.fn("SqliteJournal.transaction")(function* <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ) {
    yield* check();
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Native transactions cannot nest; use journal.commit",
      });
    const session: Session = {
      owner: sql,
      workspaceId,
      active: true,
      commit: {
        id: Commit.Id.make(crypto.randomUUID()),
        recordedAt: yield* DateTime.now,
        entryCount: 0,
      },
    };
    const native = Store.Transaction.of({
      id: session.commit.id,
      append: (request) => append(session, request),
    });
    // Reserve the driver's connection, but own the commit boundary: the generic
    // SqlClient wrapper turns COMMIT errors into defects and cannot report CommitUncertain.
    return yield* Effect.scoped(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const connection = yield* restore(sql.reserve).pipe(Effect.mapError(transactionError));
          const control = (statement: string) =>
            connection.executeUnprepared(statement, [], undefined);
          yield* control("BEGIN IMMEDIATE").pipe(Effect.mapError(transactionError));
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                Effect.updateContext((context: Context.Context<R>) =>
                  Context.add(context, Current, session),
                ),
                Effect.provideService(Store.Transaction, native),
                Effect.provideService(sql.transactionService, [connection, 0]),
              ),
            ),
          );
          session.active = false;
          if (Exit.isFailure(exit)) {
            const rollback = yield* Effect.exit(control("ROLLBACK"));
            if (Exit.isFailure(rollback)) {
              health.broken = true;
              return yield* Effect.failCause(
                Cause.combine(
                  exit.cause,
                  Cause.fail(
                    new Store.Failure({
                      operation: "rollback",
                      cause: rollback.cause,
                    }),
                  ),
                ),
              );
            }
            return yield* Effect.failCause(exit.cause);
          }
          const commit = yield* Effect.exit(control("COMMIT"));
          if (Exit.isFailure(commit)) {
            const rollback = yield* Effect.exit(control("ROLLBACK"));
            if (Exit.isFailure(rollback)) health.broken = true;
            return yield* new Store.CommitUncertain({
              commitId: session.commit.id,
              cause: commit.cause,
            });
          }
          return exit.value;
        }),
      ),
    );
  });
  const store = Store.Service.of({
    transaction,
    get: Effect.fn("SqliteJournal.get")(function* (logId, commitId) {
      return yield* guard(
        batches(
          sql`SELECT b.log_id AS logId, b.position, c.id, c.recorded_at AS recordedAt, c.entry_count AS entryCount FROM log_batches b JOIN commits c ON c.workspace_id = b.workspace_id AND c.id = b.commit_id WHERE b.workspace_id = ${workspaceId} AND b.log_id = ${logId} AND b.commit_id = ${commitId}`,
        ),
      ).pipe(Effect.map(Array.head), Effect.mapError(failure("get")));
    }),
    read: Effect.fn("SqliteJournal.read")(function* (logId, options) {
      return yield* guard(
        batches(
          sql`SELECT b.log_id AS logId, b.position, c.id, c.recorded_at AS recordedAt, c.entry_count AS entryCount FROM log_batches b JOIN commits c ON c.workspace_id = b.workspace_id AND c.id = b.commit_id WHERE b.workspace_id = ${workspaceId} AND b.log_id = ${logId} AND b.position > ${options.after ?? -1} ORDER BY b.position LIMIT ${options.limit}`,
        ),
      ).pipe(Effect.mapError(failure("read")));
    }),
    waitForAppend: Effect.fn("SqliteJournal.waitForAppend")(function* (logId, after) {
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* new Store.Failure({
          operation: "waitForAppend",
          cause: "Cannot wait inside a transaction",
        });
      // Poll durable state so independent processes and lost acknowledgments are visible.
      yield* guard(
        sql`SELECT 1 FROM log_batches WHERE workspace_id = ${workspaceId} AND log_id = ${logId} AND position > ${Option.getOrElse(after, () => -1)} LIMIT 1`,
      ).pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.repeat({ while: (available) => !available, schedule: Schedule.spaced("50 millis") }),
        Effect.mapError(failure("waitForAppend")),
      );
    }),
  });
  const cursorCodec = Schema.fromJsonString(Checkpoint.Cursor);
  const checkpoints = Checkpoint.Service.of({
    get: Effect.fn("SqliteCheckpoint.get")(function* (key) {
      const rows = yield* guard(
        sql`SELECT record FROM checkpoints WHERE workspace_id = ${workspaceId} AND log_id = ${key.logId} AND name = ${key.name} AND version = ${key.version}`,
      ).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ record: cursorCodec }))),
        ),
        Effect.mapError(failure("checkpoint.get")),
      );
      return Option.map(Array.head(rows), (row) => row.record);
    }),
    set: Effect.fn("SqliteCheckpoint.set")(function* (key, cursor) {
      yield* Store.Transaction;
      const record = yield* Schema.encodeEffect(cursorCodec)(cursor).pipe(
        Effect.mapError(failure("checkpoint.set")),
      );
      yield* guard(
        sql`INSERT INTO checkpoints VALUES (${workspaceId}, ${key.logId}, ${key.name}, ${key.version}, ${record}) ON CONFLICT(workspace_id, log_id, name, version) DO UPDATE SET record = excluded.record`,
        true,
      ).pipe(Effect.mapError(failure("checkpoint.set")));
    }),
  });
  return { store, checkpoints, guard };
});

export * as SqliteJournal from "./journal-store.ts";

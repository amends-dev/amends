import { Commit, Entry, Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Option, Schedule, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { Binding } from "./binding.ts";
import { JournalEntry } from "./journal-entry.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";

const BatchHeaderRow = Schema.Struct({
  logId: Entry.LogId,
  position: Entry.Position,
  commitId: Commit.Id,
  recordedAt: Schema.DateTimeUtcFromString,
  entryCount: Schema.Natural,
});
const BatchHeaderRows = Schema.Array(BatchHeaderRow);
const AppendHeaderRows = Schema.Array(
  Schema.Struct({
    logId: Entry.LogId,
    key: Store.IdempotencyKey,
    commitId: Commit.Id,
    firstIndex: Schema.Natural,
    entryCount: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
);

/**
 * The workspace's logs: appends inside a transaction, reads of committed batches, and waiting.
 *
 * @category constructors
 */
export const make = Effect.fn("Journal.make")(function* () {
  const { workspaceId, database, guard, transaction } = yield* Binding.Service;
  const { sql } = database;
  const decodeEntries = (input: unknown) => JournalEntry.decodeRows(workspaceId, input);

  const entries = (logId: Entry.LogId, commitId: Commit.Id) =>
    sql`SELECT id, log_id AS logId, position, commit_id AS commitId, entry_index AS "index", recorded_at AS recordedAt, payload, fact_name AS factName, fact_version AS factVersion, provenance FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${logId} AND commit_id = ${commitId} ORDER BY entry_index`.pipe(
      Effect.flatMap(decodeEntries),
    );

  const getAppend = Effect.fn("Journal.getAppend")(function* (
    logId: Entry.LogId,
    key: Store.IdempotencyKey,
  ) {
    yield* Schema.decodeEffect(Entry.LogId)(logId);
    yield* Schema.decodeEffect(Store.IdempotencyKey)(key);
    const headers =
      yield* sql`SELECT log_id AS logId, idempotency_key AS key, commit_id AS commitId, first_index AS firstIndex, entry_count AS entryCount FROM log_append_keys WHERE workspace_id = ${workspaceId} AND log_id = ${logId} AND idempotency_key = ${key}`.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(AppendHeaderRows)),
      );
    const header = Array.head(headers);
    if (Option.isNone(header)) return Option.none<Store.AppendReceipt>();
    const row = header.value;
    const values =
      yield* sql`SELECT id, log_id AS logId, position, commit_id AS commitId, entry_index AS "index", recorded_at AS recordedAt, payload, fact_name AS factName, fact_version AS factVersion, provenance FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${logId} AND commit_id = ${row.commitId} AND entry_index >= ${row.firstIndex} AND entry_index < ${row.firstIndex + row.entryCount} ORDER BY entry_index`.pipe(
        Effect.flatMap(decodeEntries),
      );
    return Option.some(
      yield* Schema.decodeUnknownEffect(Schema.toType(Store.AppendReceipt))({
        ...row,
        entries: values,
      }),
    );
  });

  /** Complete batches for the selected headers, each with its entries in index order. */
  const batches = Effect.fnUntraced(function* (
    headers: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>,
  ) {
    const selected = yield* headers.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(BatchHeaderRows)),
    );
    return yield* Effect.forEach(
      selected,
      Effect.fnUntraced(function* (row): Effect.fn.Return<
        Store.Batch,
        SqlError.SqlError | Schema.SchemaError | Store.Failure
      > {
        const values = yield* entries(row.logId, row.commitId);
        if (!Array.isReadonlyArrayNonEmpty(values))
          return yield* new Store.Failure({
            operation: "read",
            cause: "Log batch without entries",
          });
        return {
          logId: row.logId,
          position: row.position,
          commit: { id: row.commitId, recordedAt: row.recordedAt, entryCount: row.entryCount },
          entries: values,
        };
      }),
    );
  });

  const append = Effect.fn("Journal.append")(function* (
    session: Binding.TransactionState,
    input: Store.AppendInput,
  ) {
    const current = yield* Effect.serviceOption(Binding.CurrentTransaction);
    if (!session.active || Option.isNone(current) || current.value !== session)
      return yield* new Store.Failure({
        operation: "append",
        cause: "Closed or foreign append handle",
      });
    const request = yield* Schema.decodeEffect(Schema.toType(Store.AppendInput))(input).pipe(
      Effect.mapError(storeConflict(Store, "append")),
    );
    if (
      request.entries.some(
        (entry) => entry.fact !== undefined && entry.fact.provenance.workspaceId !== workspaceId,
      )
    )
      return yield* new Store.Conflict({
        operation: "append",
        message: "Fact belongs to another workspace",
      });
    if (request.idempotencyKey !== undefined) {
      const previous = yield* getAppend(request.logId, request.idempotencyKey).pipe(
        Effect.mapError(storeFailure(Store, "append")),
      );
      if (Option.isSome(previous)) {
        if (!Store.sameContents(request.entries, previous.value.entries))
          return yield* new Store.Conflict({
            operation: "append",
            message: "Idempotency key is already associated with different content",
          });
        return previous.value.entries;
      }
    }
    const last =
      yield* sql`SELECT position, commit_id AS commitId FROM log_batches WHERE workspace_id = ${workspaceId} AND log_id = ${request.logId} ORDER BY position DESC LIMIT 1`.pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ position: Entry.Position, commitId: Commit.Id })),
          ),
        ),
        Effect.map(Array.head),
        Effect.mapError(storeFailure(Store, "append")),
      );
    if (request.expectedAfter !== undefined) {
      const actual = Option.map(last, (value) => value.position);
      if (!Option.makeEquivalence<number>((a, b) => a === b)(actual, request.expectedAfter))
        return yield* new Store.Conflict({
          operation: "append",
          message: "Expected log position changed",
        });
    }
    if (request.entries.length === 0) return [];
    const extending = Option.isSome(last) && last.value.commitId === session.commit.id;
    const position = Entry.Position.make(
      Option.isNone(last) ? 0 : last.value.position + (extending ? 0 : 1),
    );
    const written = extending
      ? (yield* entries(request.logId, session.commit.id).pipe(
          Effect.mapError(storeFailure(Store, "append")),
        )).length
      : 0;
    const recordedAt = yield* DateTime.now;
    yield* sql`INSERT INTO commits (workspace_id, id, recorded_at, entry_count) VALUES (${workspaceId}, ${session.commit.id}, ${DateTime.formatIso(session.commit.recordedAt)}, 0) ON CONFLICT DO NOTHING`.pipe(
      Effect.mapError(storeError(Store, "append")),
    );
    if (!extending)
      yield* sql`INSERT INTO log_batches VALUES (${workspaceId}, ${request.logId}, ${position}, ${session.commit.id})`.pipe(
        Effect.mapError(storeError(Store, "append")),
      );
    const result: Array<Store.Entry> = [];
    for (const [offset, content] of request.entries.entries()) {
      const id = Entry.Id.make(crypto.randomUUID());
      const index = written + offset;
      const columns = yield* JournalEntry.toColumns(content).pipe(
        Effect.mapError(storeFailure(Store, "append")),
      );
      yield* sql`INSERT INTO log_entries (workspace_id, id, log_id, position, commit_id, entry_index, recorded_at, payload, fact_name, fact_version, provenance) VALUES (${workspaceId}, ${id}, ${request.logId}, ${position}, ${session.commit.id}, ${index}, ${DateTime.formatIso(recordedAt)}, ${content.payload}, ${columns.factName}, ${columns.factVersion}, ${columns.provenance})`.pipe(
        Effect.mapError(storeError(Store, "append")),
      );
      result.push({
        id,
        logId: request.logId,
        position,
        commitId: session.commit.id,
        index,
        recordedAt,
        ...content,
        payload: content.payload.slice(),
      });
    }
    yield* sql`UPDATE commits SET entry_count = entry_count + ${result.length} WHERE workspace_id = ${workspaceId} AND id = ${session.commit.id}`.pipe(
      Effect.mapError(storeError(Store, "append")),
    );
    if (request.idempotencyKey !== undefined)
      yield* sql`INSERT INTO log_append_keys (workspace_id, log_id, idempotency_key, commit_id, first_index, entry_count) VALUES (${workspaceId}, ${request.logId}, ${request.idempotencyKey}, ${session.commit.id}, ${written}, ${result.length})`.pipe(
        Effect.mapError(storeError(Store, "append")),
      );
    return result;
  });

  return Store.Service.of({
    readFacts: Effect.fn("Journal.readFacts")(function* (logId, input) {
      return yield* guard(
        Effect.gen(function* () {
          yield* Schema.decodeEffect(Entry.LogId)(logId);
          const options = yield* Schema.decodeEffect(Store.ReadFactsOptions)(input);
          const version =
            options.version === undefined ? sql`` : sql`AND fact_version = ${options.version}`;
          return yield* sql`SELECT id, log_id AS logId, position, commit_id AS commitId, entry_index AS "index", recorded_at AS recordedAt, payload, fact_name AS factName, fact_version AS factVersion, provenance FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${logId} AND fact_name = ${options.name} ${version} AND (position, entry_index) > (${options.after?.position ?? -1}, ${options.after?.index ?? -1}) ORDER BY position, entry_index LIMIT ${options.limit}`.pipe(
            Effect.flatMap(decodeEntries),
          );
        }),
      ).pipe(Effect.mapError(storeFailure(Store, "readFacts")));
    }),
    getAppend: (logId, key) =>
      guard(getAppend(logId, key)).pipe(Effect.mapError(storeFailure(Store, "getAppend"))),
    transaction: (program, options) =>
      transaction(
        program,
        (session) => ({
          id: session.commit.id,
          append: (request) => guard(append(session, request), true),
        }),
        options,
      ),
    get: (logId, commitId) =>
      guard(
        batches(
          sql`SELECT b.log_id AS logId, b.position, c.id AS commitId, c.recorded_at AS recordedAt, c.entry_count AS entryCount FROM log_batches b JOIN commits c ON c.workspace_id = b.workspace_id AND c.id = b.commit_id WHERE b.workspace_id = ${workspaceId} AND b.log_id = ${logId} AND b.commit_id = ${commitId}`,
        ),
      ).pipe(Effect.map(Array.head), Effect.mapError(storeFailure(Store, "get"))),
    read: (logId, options) =>
      guard(
        batches(
          sql`SELECT b.log_id AS logId, b.position, c.id AS commitId, c.recorded_at AS recordedAt, c.entry_count AS entryCount FROM log_batches b JOIN commits c ON c.workspace_id = b.workspace_id AND c.id = b.commit_id WHERE b.workspace_id = ${workspaceId} AND b.log_id = ${logId} AND b.position > ${options.after ?? -1} ORDER BY b.position LIMIT ${options.limit}`,
        ),
      ).pipe(Effect.mapError(storeFailure(Store, "read"))),
    waitForAppend: Effect.fn("Journal.waitForAppend")(function* (logId, after) {
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
        Effect.mapError(storeFailure(Store, "waitForAppend")),
      );
    }),
  });
});

/**
 * Provide Store.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Store.Service, make());

export * as Journal from "./journal.ts";

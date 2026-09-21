import { Commit, Entry, Store } from "@amends/core/journal";
import { and, asc, count, desc, eq, gt, gte, lt, inArray, or } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Option, Schedule, Schema } from "effect";
import { JournalEntry } from "./journal-entry.ts";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { commits, logAppendKeys, logBatches, logEntries } from "./schema.ts";

const BatchHeaderRow = Schema.Struct({
  logId: Entry.LogId,
  position: Entry.Position,
  commitId: Commit.Id,
  recordedAt: Schema.DateTimeUtcFromDate,
  entryCount: Schema.Natural,
});
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
  const { workspaceId, database, guard, transaction, pollInterval } = yield* Binding.Service;
  const { db, sql } = database;

  const scoped = (logId: Entry.LogId) =>
    and(eq(logBatches.workspaceId, workspaceId), eq(logBatches.logId, logId));
  const headerColumns = {
    logId: logBatches.logId,
    position: logBatches.position,
    commitId: commits.id,
    recordedAt: commits.recordedAt,
    entryCount: commits.entryCount,
  };
  const entryColumns = JournalEntry.columns;
  const decodeEntries = (input: unknown) => JournalEntry.decodeRows(workspaceId, input);
  const headers = () =>
    db
      .select(headerColumns)
      .from(logBatches)
      .innerJoin(
        commits,
        and(eq(commits.workspaceId, logBatches.workspaceId), eq(commits.id, logBatches.commitId)),
      );

  const getAppend = Effect.fn("Journal.getAppend")(function* (
    logId: Entry.LogId,
    key: Store.IdempotencyKey,
  ) {
    yield* Schema.decodeEffect(Entry.LogId)(logId);
    yield* Schema.decodeEffect(Store.IdempotencyKey)(key);
    const found = yield* db
      .select({
        logId: logAppendKeys.logId,
        key: logAppendKeys.key,
        commitId: logAppendKeys.commitId,
        firstIndex: logAppendKeys.firstIndex,
        entryCount: logAppendKeys.entryCount,
      })
      .from(logAppendKeys)
      .where(
        and(
          eq(logAppendKeys.workspaceId, workspaceId),
          eq(logAppendKeys.logId, logId),
          eq(logAppendKeys.key, key),
        ),
      )
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(AppendHeaderRows)));
    const header = Array.head(found);
    if (Option.isNone(header)) return Option.none<Store.AppendReceipt>();
    const row = header.value;
    const values = yield* db
      .select(entryColumns)
      .from(logEntries)
      .where(
        and(
          eq(logEntries.workspaceId, workspaceId),
          eq(logEntries.logId, logId),
          eq(logEntries.commitId, row.commitId),
          gte(logEntries.entryIndex, row.firstIndex),
          lt(logEntries.entryIndex, row.firstIndex + row.entryCount),
        ),
      )
      .orderBy(asc(logEntries.entryIndex))
      .pipe(Effect.flatMap(decodeEntries));
    return Option.some(
      yield* Schema.decodeUnknownEffect(Schema.toType(Store.AppendReceipt))({
        ...row,
        entries: values,
      }),
    );
  });

  /** Complete batches for the selected headers, each with its entries in index order. */
  const batches = Effect.fnUntraced(function* (
    selection: Effect.Effect<ReadonlyArray<unknown>, unknown>,
  ) {
    const selected = yield* selection.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(BatchHeaderRow))),
    );
    if (!Array.isReadonlyArrayNonEmpty(selected)) return [];
    const rows = yield* db
      .select(entryColumns)
      .from(logEntries)
      .where(
        and(
          eq(logEntries.workspaceId, workspaceId),
          eq(logEntries.logId, selected[0].logId),
          inArray(
            logEntries.position,
            selected.map((header) => header.position),
          ),
        ),
      )
      .orderBy(asc(logEntries.position), asc(logEntries.entryIndex))
      .pipe(Effect.flatMap(decodeEntries));
    const byPosition = Array.groupBy(rows, (row) => String(row.position));
    return yield* Effect.forEach(selected, (header) => {
      const values = byPosition[String(header.position)];
      if (values === undefined || !Array.isReadonlyArrayNonEmpty(values))
        return Effect.fail(
          new Store.Failure({ operation: "read", cause: "Log batch without entries" }),
        );
      const batch: Store.Batch = {
        logId: header.logId,
        position: header.position,
        commit: {
          id: header.commitId,
          recordedAt: header.recordedAt,
          entryCount: header.entryCount,
        },
        entries: Array.map(values, (row) => ({ ...row, payload: row.payload.slice() })),
      };
      return Effect.succeed(batch);
    });
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
    const last = yield* db
      .select({ position: logBatches.position, commitId: logBatches.commitId })
      .from(logBatches)
      .where(scoped(request.logId))
      .orderBy(desc(logBatches.position))
      .limit(1)
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ position: Entry.Position, commitId: Commit.Id })),
          ),
        ),
        Effect.map(Array.head),
        Effect.mapError(storeError(Store, "append")),
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
      ? yield* db
          .select({ count: count() })
          .from(logEntries)
          .where(
            and(
              eq(logEntries.workspaceId, workspaceId),
              eq(logEntries.logId, request.logId),
              eq(logEntries.commitId, session.commit.id),
            ),
          )
          .pipe(
            Effect.map((rows) => rows[0]?.count ?? 0),
            Effect.mapError(storeError(Store, "append")),
          )
      : 0;
    const recordedAt = yield* DateTime.now;
    yield* db
      .insert(commits)
      .values({
        workspaceId,
        id: session.commit.id,
        recordedAt: DateTime.toDate(session.commit.recordedAt),
        entryCount: 0,
      })
      .onConflictDoNothing()
      .pipe(Effect.mapError(storeError(Store, "append")));
    if (!extending)
      yield* db
        .insert(logBatches)
        .values({ workspaceId, logId: request.logId, position, commitId: session.commit.id })
        .pipe(Effect.mapError(storeError(Store, "append")));
    const result: Array<Store.Entry> = [];
    for (const [offset, content] of request.entries.entries()) {
      const id = Entry.Id.make(crypto.randomUUID());
      const index = written + offset;
      yield* db
        .insert(logEntries)
        .values({
          workspaceId,
          id,
          logId: request.logId,
          position,
          commitId: session.commit.id,
          entryIndex: index,
          recordedAt: DateTime.toDate(recordedAt),
          payload: content.payload.slice(),
          ...JournalEntry.toColumns(content),
        })
        .pipe(Effect.mapError(storeError(Store, "append")));
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
      yield* db
        .insert(logAppendKeys)
        .values({
          workspaceId,
          logId: request.logId,
          key: request.idempotencyKey,
          commitId: session.commit.id,
          firstIndex: written,
          entryCount: result.length,
        })
        .pipe(Effect.mapError(storeError(Store, "append")));
    return result;
  });

  return Store.Service.of({
    getEntry: Effect.fn("Journal.getEntry")(
      function* (logId, entryId) {
        yield* Schema.decodeEffect(Entry.LogId)(logId);
        yield* Schema.decodeEffect(Entry.Id)(entryId);
        return yield* guard(
          db
            .select(entryColumns)
            .from(logEntries)
            .where(
              and(
                eq(logEntries.workspaceId, workspaceId),
                eq(logEntries.logId, logId),
                eq(logEntries.id, entryId),
              ),
            ),
        ).pipe(Effect.flatMap(decodeEntries), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(Store, "getEntry")),
    ),
    readFacts: Effect.fn("Journal.readFacts")(function* (logId, input) {
      return yield* guard(
        Effect.gen(function* () {
          yield* Schema.decodeEffect(Entry.LogId)(logId);
          const options = yield* Schema.decodeEffect(Store.ReadFactsOptions)(input);
          return yield* db
            .select(entryColumns)
            .from(logEntries)
            .where(
              and(
                eq(logEntries.workspaceId, workspaceId),
                eq(logEntries.logId, logId),
                options.name === undefined ? undefined : eq(logEntries.factName, options.name),
                options.subject === undefined ? undefined : eq(logEntries.subject, options.subject),
                options.version === undefined
                  ? undefined
                  : eq(logEntries.factVersion, options.version),
                options.after === undefined
                  ? undefined
                  : or(
                      gt(logEntries.position, options.after.position),
                      and(
                        eq(logEntries.position, options.after.position),
                        gt(logEntries.entryIndex, options.after.index),
                      ),
                    ),
              ),
            )
            .orderBy(asc(logEntries.position), asc(logEntries.entryIndex))
            .limit(options.limit)
            .pipe(Effect.flatMap(decodeEntries));
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
    get: Effect.fn("Journal.get")(function* (logId, commitId) {
      return yield* guard(
        batches(headers().where(and(scoped(logId), eq(logBatches.commitId, commitId)))),
      ).pipe(Effect.map(Array.head), Effect.mapError(storeFailure(Store, "get")));
    }),
    read: Effect.fn("Journal.read")(function* (logId, options) {
      return yield* guard(
        batches(
          headers()
            .where(and(scoped(logId), gt(logBatches.position, options.after ?? -1)))
            .orderBy(asc(logBatches.position))
            .limit(options.limit),
        ),
      ).pipe(Effect.mapError(storeFailure(Store, "read")));
    }),
    waitForAppend: Effect.fn("Journal.waitForAppend")(function* (logId, after) {
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* new Store.Failure({
          operation: "waitForAppend",
          cause: "Cannot wait inside a transaction",
        });
      // Poll committed state so other processes and lost acknowledgments are visible.
      yield* guard(
        db
          .select({ position: logBatches.position })
          .from(logBatches)
          .where(
            and(
              scoped(logId),
              gt(
                logBatches.position,
                Option.getOrElse(after, () => -1),
              ),
            ),
          )
          .limit(1),
      ).pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.repeat({
          while: (available) => !available,
          schedule: Schedule.spaced(pollInterval),
        }),
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

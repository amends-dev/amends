/**
 * The PostgreSQL driver for `Store.Store`, the journal's storage of the workspace's logs, over
 * `commits`, `log_batches`, `log_entries`, and `log_append_keys`. A transaction stages its appends
 * in memory and writes them just before `COMMIT`, or earlier when it reads a log's batches, head,
 * or facts, in as few inserts as the parameter limit allows. Appending to a log, or looking up one
 * of its keys, holds the log's advisory lock until the transaction ends; a standalone append is a
 * commit of its own that holds only its log. `JournalEntry` maps entries to their columns.
 * `Store.make` checks every input before the driver sees it, so the driver keeps only what storage
 * keeps: a key reused with different content, a log that moved past `expectedAfter`, and
 * contention, each a `StoreError.StoreError`. A commit that appended notifies once it commits,
 * waking `waitForAppend` in every process; the binding's poll interval covers a lost notice.
 *
 * @since 0.1.0
 */
import { Commit, Entry, Occurrence, Store, StoreError } from "@amends-dev/core/journal";
import { and, asc, desc, eq, gt, gte, lt, lte, sql } from "drizzle-orm";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as JournalEntry from "./JournalEntry.ts";
import * as PostgresNotices from "./PostgresNotices.ts";
import * as Binding from "./Binding.ts";
import { isContention, raceError } from "./internal/errors.ts";
import { insertChunked } from "./internal/parameters.ts";
import { commits, logAppendKeys, logBatches, logEntries } from "./internal/schema.ts";

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
    key: Occurrence.Key,
    commitId: Commit.Id,
    firstIndex: Schema.Natural,
    entryCount: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
);

/**
 * What one transaction has appended but not yet written, and what it learned about its logs.
 * Appends stage entries in memory; the transaction writes them all at once before it commits,
 * or earlier when it reads the log.
 */
interface Staging {
  /** Logs this transaction holds against other writers of the log, until it ends. */
  readonly held: Set<Entry.LogId>;
  /** The batch this commit opened in each log: its position and next entry index. */
  readonly open: Map<Entry.LogId, { readonly position: Entry.Position; next: number }>;
  /** Keyed appends this transaction looked up or staged, by log and key. */
  readonly receipts: Map<string, Option.Option<Store.AppendReceipt>>;
  readonly batches: Array<{ readonly logId: Entry.LogId; readonly position: Entry.Position }>;
  readonly entries: Array<Store.Entry>;
  readonly keys: Array<Omit<Store.AppendReceipt, "entries">>;
  /** Entries this commit has appended in every log; its commit row records the total. */
  entryCount: number;
}

/** Entries per insert, fewer than their parameters allow, since each carries its payload. */
const entriesPerInsert = 500;

const receiptKey = (logId: Entry.LogId, key: Occurrence.Key) => JSON.stringify([logId, key]);
const copyEntry = (entry: Store.Entry): Store.Entry =>
  Object.assign({}, entry, { payload: entry.payload.slice() });
const copyReceipt = (receipt: Store.AppendReceipt): Store.AppendReceipt =>
  Object.assign({}, receipt, { entries: receipt.entries.map(copyEntry) });

/**
 * Builds the journal store for the binding's workspace: appends inside a transaction, reads of
 * committed batches, and waiting, inside `Store.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Journal.make")(function* () {
  const { workspaceId, database, guard, transaction, pollInterval } = yield* Binding.Binding;
  const { db } = database;

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

  const storedAppend = Effect.fn("Journal.storedAppend")(function* (
    logId: Entry.LogId,
    key: Occurrence.Key,
  ) {
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
          // The selected batches are consecutive in the log, so their positions span a range.
          gte(logEntries.position, selected[0].position),
          lte(logEntries.position, Array.lastNonEmpty(selected).position),
        ),
      )
      .orderBy(asc(logEntries.position), asc(logEntries.entryIndex))
      .pipe(Effect.flatMap(decodeEntries));
    const byPosition = Array.groupBy(rows, (row) => String(row.position));
    return yield* Effect.forEach(selected, (header) => {
      const values = byPosition[String(header.position)];
      if (values === undefined || !Array.isReadonlyArrayNonEmpty(values))
        return Effect.fail(StoreError.failed("Store", "read")("Log batch without entries"));
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

  const stagings = new WeakMap<Binding.TransactionState, Staging>();

  /** Write everything the transaction has staged, as one statement per table. */
  const flush = Effect.fnUntraced(
    function* (session: Binding.TransactionState) {
      const staging = stagings.get(session);
      if (staging === undefined || staging.entries.length === 0) return;
      const { batches, entries, keys } = staging;
      yield* db
        .insert(commits)
        .values({
          workspaceId,
          id: session.commit.id,
          recordedAt: DateTime.toDate(session.commit.recordedAt),
          entryCount: staging.entryCount,
        })
        .onConflictDoUpdate({
          target: [commits.workspaceId, commits.id],
          set: { entryCount: staging.entryCount },
        });
      yield* insertChunked(
        logBatches,
        batches.map((batch) => Object.assign({ workspaceId, commitId: session.commit.id }, batch)),
        (chunk) => db.insert(logBatches).values(chunk),
      );
      // Sent once the transaction commits, and only then; repeats within it are sent once.
      for (const batch of batches)
        session.notices.add(PostgresNotices.appendNotice(workspaceId, batch.logId));
      yield* insertChunked(
        logEntries,
        entries.map((entry) =>
          Object.assign(
            {
              workspaceId,
              id: entry.id,
              logId: entry.logId,
              position: entry.position,
              commitId: entry.commitId,
              entryIndex: entry.index,
              recordedAt: DateTime.toDate(entry.recordedAt),
              payload: entry.payload,
            },
            JournalEntry.toColumns(entry),
          ),
        ),
        (chunk) => db.insert(logEntries).values(chunk),
        { limit: entriesPerInsert },
      );
      yield* insertChunked(
        logAppendKeys,
        keys.map((receipt) => Object.assign({ workspaceId }, receipt)),
        (chunk) => db.insert(logAppendKeys).values(chunk),
      );
      batches.length = 0;
      entries.length = 0;
      keys.length = 0;
    },
    Effect.mapError(raceError("Store", "append")),
  );

  const stagingOf = (session: Binding.TransactionState) => {
    const existing = stagings.get(session);
    if (existing !== undefined) return existing;
    const staging: Staging = {
      held: new Set(),
      open: new Map(),
      receipts: new Map(),
      batches: [],
      entries: [],
      keys: [],
      entryCount: 0,
    };
    stagings.set(session, staging);
    session.beforeCommit = flush(session);
    return staging;
  };

  /** The caller's live transaction on this binding, if it has staged anything. */
  const stagedSession = Effect.map(Effect.serviceOption(Binding.CurrentTransaction), (current) =>
    Option.filter(current, (session) => session.active && stagings.has(session)),
  );
  /** Reads of whole batches see the transaction's own appends once they are written. */
  const flushed = <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.flatMap(stagedSession, (session) =>
      Option.isSome(session) ? Effect.andThen(flush(session.value), program) : program,
    );

  /**
   * Hold a log for the rest of the transaction: its other writers, a standalone append or
   * another transaction, wait until it ends, so its position and keys stay true meanwhile. A
   * log's key is a hash of its workspace and ID, seeded apart from workspace keys.
   */
  const hold = Effect.fnUntraced(function* (staging: Staging, logId: Entry.LogId) {
    if (staging.held.has(logId)) return;
    yield* database.sql
      .unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [
        JSON.stringify([workspaceId, logId]),
      ])
      .pipe(
        Effect.mapError((cause) =>
          isContention(cause)
            ? StoreError.contended("Store", "append", "Another writer holds the log")
            : StoreError.failed("Store", "append")(cause),
        ),
      );
    staging.held.add(logId);
  });

  /** A keyed append, from what this transaction staged or looked up before, else from storage. */
  const receiptIn = Effect.fnUntraced(function* (
    staging: Staging,
    logId: Entry.LogId,
    key: Occurrence.Key,
  ) {
    const id = receiptKey(logId, key);
    const known = staging.receipts.get(id);
    if (known !== undefined) return Option.map(known, copyReceipt);
    // Holding the log keeps a lookup true for the whole transaction.
    yield* hold(staging, logId);
    const stored = yield* storedAppend(logId, key);
    staging.receipts.set(id, stored);
    return Option.map(stored, copyReceipt);
  });

  const append = Effect.fn("Journal.append")(function* (
    session: Binding.TransactionState,
    request: Store.AppendInput,
  ) {
    const current = yield* Effect.serviceOption(Binding.CurrentTransaction);
    if (!session.active || Option.isNone(current) || current.value !== session)
      return yield* StoreError.failed("Store", "append")("Closed or foreign append handle");
    const staging = stagingOf(session);
    yield* hold(staging, request.logId);
    if (request.idempotencyKey !== undefined) {
      const previous = yield* receiptIn(staging, request.logId, request.idempotencyKey).pipe(
        Effect.mapError(StoreError.failed("Store", "append")),
      );
      if (Option.isSome(previous)) {
        if (!Store.sameContents(request.entries, previous.value.entries))
          return yield* StoreError.rejected(
            "Store",
            "append",
            "Idempotency key is already associated with different content",
          );
        return previous.value.entries;
      }
    }
    const opened = staging.open.get(request.logId);
    // A log this commit has not appended to yet ends at its last stored batch.
    const last =
      opened !== undefined
        ? Option.some(opened.position)
        : yield* db
            .select({ position: logBatches.position })
            .from(logBatches)
            .where(scoped(request.logId))
            .orderBy(desc(logBatches.position))
            .limit(1)
            .pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(
                  Schema.Array(Schema.Struct({ position: Entry.Position })),
                ),
              ),
              Effect.map((rows) => Option.map(Array.head(rows), (row) => row.position)),
              Effect.mapError(StoreError.failed("Store", "append")),
            );
    if (request.expectedAfter !== undefined) {
      if (!Option.makeEquivalence<number>((a, b) => a === b)(last, request.expectedAfter))
        return yield* StoreError.contended("Store", "append", "Expected log position changed");
    }
    if (request.entries.length === 0) return [];
    const batch =
      opened ??
      (() => {
        const position = Entry.Position.make(
          Option.match(last, { onNone: () => 0, onSome: (value) => value + 1 }),
        );
        const created = { position, next: 0 };
        staging.open.set(request.logId, created);
        staging.batches.push({ logId: request.logId, position });
        return created;
      })();
    const first = batch.next;
    const recordedAt = yield* DateTime.now;
    const entries = request.entries.map((content, offset): Store.Entry =>
      Object.assign(
        {
          id: Entry.Id.make(crypto.randomUUID()),
          logId: request.logId,
          position: batch.position,
          commitId: session.commit.id,
          index: first + offset,
          recordedAt,
        },
        content,
        { payload: content.payload.slice() },
      ),
    );
    batch.next = first + entries.length;
    staging.entries.push(...entries);
    staging.entryCount += entries.length;
    if (request.idempotencyKey !== undefined && Array.isReadonlyArrayNonEmpty(entries)) {
      const receipt = {
        logId: request.logId,
        key: request.idempotencyKey,
        commitId: session.commit.id,
        firstIndex: first,
        entryCount: entries.length,
      };
      staging.keys.push(receipt);
      staging.receipts.set(
        receiptKey(request.logId, request.idempotencyKey),
        Option.some(Object.assign({}, receipt, { entries: Array.map(entries, copyEntry) })),
      );
    }
    return entries.map(copyEntry);
  });

  const driver: Store.Store["Service"] = {
    workspaceId,
    getEntry: Effect.fn("Journal.getEntry")(
      function* (logId, entryId) {
        // An entry is either staged by this transaction or stored; staged ones need no write.
        const session = yield* stagedSession;
        const staged = Option.flatMap(session, (value) =>
          Option.fromUndefinedOr(
            stagings
              .get(value)
              ?.entries.find((entry) => entry.logId === logId && entry.id === entryId),
          ),
        );
        if (Option.isSome(staged)) return Option.some(copyEntry(staged.value));
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
      Effect.mapError(StoreError.failed("Store", "getEntry")),
    ),
    readFacts: Effect.fn("Journal.readFacts")(function* (logId, options) {
      return yield* flushed(
        guard(
          db
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
                // A row comparison bounds the index scan; the equivalent OR form only filters it.
                options.after === undefined
                  ? undefined
                  : sql`(${logEntries.position}, ${logEntries.entryIndex}) > (${options.after.position}, ${options.after.index})`,
              ),
            )
            .orderBy(asc(logEntries.position), asc(logEntries.entryIndex))
            .limit(options.limit)
            .pipe(Effect.flatMap(decodeEntries)),
        ),
      ).pipe(Effect.mapError(StoreError.failed("Store", "readFacts")));
    }),
    getAppend: (logId, key) =>
      guard(
        // Inside a transaction, the lookup holds the log, so it stays true until the commit.
        Effect.flatMap(Effect.serviceOption(Binding.CurrentTransaction), (session) =>
          Option.isSome(session) && session.value.active
            ? receiptIn(stagingOf(session.value), logId, key)
            : storedAppend(logId, key),
        ),
      ).pipe(Effect.mapError(StoreError.failed("Store", "getAppend"))),
    transaction: (program) =>
      transaction(program, (session) => ({
        id: session.commit.id,
        append: (request) => guard(append(session, request), true),
        afterCommit: (effect) => Binding.afterCommit(session, effect),
      })),
    append: Effect.fn("Journal.appendAlone")(function* (request) {
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* StoreError.failed(
          "Store",
          "append",
        )("A standalone append cannot run inside a transaction; use its append");
      // Its own commit, holding only the log: the workspace's transactions do not wait for it.
      return yield* transaction(
        Effect.flatMap(Store.Transaction, (storeTransaction) => storeTransaction.append(request)),
        (session) => ({
          id: session.commit.id,
          append: (input) => guard(append(session, input), true),
          afterCommit: (effect) => Binding.afterCommit(session, effect),
        }),
        { log: request.logId },
      );
    }),
    get: Effect.fn("Journal.get")(function* (logId, commitId) {
      return yield* flushed(
        guard(batches(headers().where(and(scoped(logId), eq(logBatches.commitId, commitId))))),
      ).pipe(Effect.map(Array.head), Effect.mapError(StoreError.failed("Store", "get")));
    }),
    head: Effect.fn("Journal.head")(function* (logId) {
      return yield* flushed(
        guard(
          db
            .select({ position: logBatches.position })
            .from(logBatches)
            .where(scoped(logId))
            .orderBy(desc(logBatches.position))
            .limit(1),
        ),
      ).pipe(
        Effect.flatMap((rows) =>
          Schema.decodeEffect(Schema.Array(Schema.Struct({ position: Entry.Position })))(rows),
        ),
        Effect.map((rows) => Option.map(Array.head(rows), (row) => row.position)),
        Effect.mapError(StoreError.failed("Store", "head")),
      );
    }),
    read: Effect.fn("Journal.read")(function* (logId, options) {
      return yield* flushed(
        guard(
          batches(
            headers()
              .where(and(scoped(logId), gt(logBatches.position, options.after ?? -1)))
              .orderBy(asc(logBatches.position))
              .limit(options.limit),
          ),
        ),
      ).pipe(Effect.mapError(StoreError.failed("Store", "read")));
    }),
    waitForAppend: Effect.fn("Journal.waitForAppend")(function* (logId, after) {
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* StoreError.failed(
          "Store",
          "waitForAppend",
        )("Cannot wait inside a transaction");
      const appended = guard(
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
        Effect.mapError(StoreError.failed("Store", "waitForAppend")),
      );
      // Committed state is the truth, so other processes and lost acknowledgments are visible;
      // notifications only say when to look again, and the interval covers any that are lost.
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* database.notices.listening;
          while (true) {
            const nextAppend = database.notices.nextAppend(workspaceId, logId);
            if (yield* appended) return;
            yield* Deferred.await(nextAppend).pipe(Effect.timeoutOption(pollInterval));
          }
        }),
      );
    }),
  };
  return Store.make(driver);
});

/**
 * Provides `Store.Store` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Store.Store, make());

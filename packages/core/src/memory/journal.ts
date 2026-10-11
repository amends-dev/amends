import { Commit, Entry, Store } from "../journal/index.ts";
import { Array, DateTime, Deferred, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./binding.ts";
import * as MemoryDatabase from "./database.ts";
import { storeFailure } from "./errors.ts";
import { keyOf } from "./rows.ts";

const validateReceipt = Schema.decodeUnknownEffect(Schema.toType(Store.AppendReceipt));
/** Decoding builds new objects, so a returned entry shares nothing mutable with storage. */
const decodeEntry = Schema.decodeEffect(Schema.toType(Store.Entry));
const copyEntry = (entry: Store.Entry) =>
  decodeEntry(Object.assign({}, entry, { payload: entry.payload.slice() }));
const copyEntries = (entries: ReadonlyArray<Store.Entry>) => Effect.forEach(entries, copyEntry);

/** Is the cursor (position, index) strictly after the other? */
const isAfter = (entry: Store.Cursor, cursor: Store.Cursor) =>
  entry.position > cursor.position ||
  (entry.position === cursor.position && entry.index > cursor.index);

/**
 * The workspace's logs: appends inside a transaction, reads of committed batches, and waiting.
 *
 * @category constructors
 */
export const make = Effect.fn("Journal.make")(function* () {
  const { workspaceId, connection, read, transaction } = yield* Binding.Binding;
  const { database } = connection;

  /** A log's batch as the contract returns it, with its commit and copied entries. */
  const batchOf = Effect.fnUntraced(function* (
    space: MemoryDatabase.Space,
    logId: Entry.LogId,
    batch: MemoryDatabase.Batch,
  ) {
    const commit = space.commits.get(batch.commitId);
    const entries = yield* copyEntries(batch.entries);
    if (commit === undefined || !Array.isReadonlyArrayNonEmpty(entries))
      return yield* new Store.Failure({ operation: "read", cause: "Incomplete log batch" });
    return { logId, position: batch.position, commit: Object.assign({}, commit), entries };
  });

  const receiptOf = Effect.fnUntraced(function* (
    space: MemoryDatabase.Space,
    logId: Entry.LogId,
    key: Store.IdempotencyKey,
  ) {
    const slice = space.appends.get(keyOf(logId, key));
    if (slice === undefined) return Option.none<Store.AppendReceipt>();
    const batch = (space.logs.get(logId) ?? []).find((batch) => batch.commitId === slice.commitId);
    const entries = yield* copyEntries(
      (batch?.entries ?? []).slice(slice.firstIndex, slice.firstIndex + slice.entryCount),
    );
    return Option.some(yield* validateReceipt({ logId, key, ...slice, entries }));
  });

  /**
   * Hold a log for the rest of the transaction, then bring the snapshot's view of it up to date:
   * its other writers may have committed since the snapshot, and none can until this one ends.
   */
  const hold = Effect.fnUntraced(function* (session: Binding.TransactionState, logId: string) {
    if (session.held.has(logId)) return;
    const lock = MemoryDatabase.logLock(database, workspaceId, logId);
    yield* Effect.uninterruptibleMask((restore) =>
      restore(lock.take(1)).pipe(Effect.tap(() => Effect.sync(() => session.held.add(logId)))),
    );
    const current = MemoryDatabase.committed(database, workspaceId);
    const batches = current.logs.get(logId);
    if (batches === undefined) return;
    session.space.logs.set(logId, batches);
    for (const batch of batches) {
      const commit = current.commits.get(batch.commitId);
      if (commit !== undefined && !session.space.commits.has(batch.commitId))
        session.space.commits.set(batch.commitId, commit);
    }
    for (const [key, slice] of current.appends)
      if (!session.space.appends.has(key)) session.space.appends.set(key, slice);
  });

  const append = Effect.fn("Journal.append")(function* (
    session: Binding.TransactionState,
    request: Store.AppendInput,
  ) {
    const current = yield* Effect.serviceOption(Binding.CurrentTransaction);
    if (!session.active || Option.isNone(current) || current.value !== session)
      return yield* new Store.Failure({
        operation: "append",
        cause: "Closed or foreign append handle",
      });
    yield* hold(session, request.logId);
    const space = session.space;
    if (request.idempotencyKey !== undefined) {
      const previous = yield* receiptOf(space, request.logId, request.idempotencyKey).pipe(
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
    const batches = space.logs.get(request.logId) ?? [];
    const last = Array.last(batches);
    if (request.expectedAfter !== undefined) {
      const actual = Option.map(last, (batch) => batch.position);
      if (!Option.makeEquivalence<number>((a, b) => a === b)(actual, request.expectedAfter))
        return yield* new Store.Conflict({
          operation: "append",
          message: "Expected log position changed",
        });
    }
    if (request.entries.length === 0) return [];
    // A commit's appends to one log share a position and extend its indexes.
    const open = Option.filter(last, (batch) => batch.commitId === session.commit.id);
    const position = Entry.Position.make(
      Option.match(last, {
        onNone: () => 0,
        onSome: (batch) => batch.position + (Option.isSome(open) ? 0 : 1),
      }),
    );
    const existing = Option.match(open, { onNone: () => [], onSome: (batch) => batch.entries });
    const recordedAt = yield* DateTime.now;
    const written = request.entries.map((content, offset): Store.Entry =>
      Object.assign(
        {
          id: Entry.Id.make(database.nextId("entry")),
          logId: request.logId,
          position,
          commitId: session.commit.id,
          index: existing.length + offset,
          recordedAt,
        },
        content,
        { payload: content.payload.slice() },
      ),
    );
    const batch = { position, commitId: session.commit.id, entries: [...existing, ...written] };
    space.logs.set(
      request.logId,
      Option.isSome(open) ? [...batches.slice(0, -1), batch] : [...batches, batch],
    );
    const commit = space.commits.get(session.commit.id) ?? session.commit;
    space.commits.set(
      session.commit.id,
      Object.assign({}, commit, { entryCount: commit.entryCount + written.length }),
    );
    if (request.idempotencyKey !== undefined)
      space.appends.set(keyOf(request.logId, request.idempotencyKey), {
        commitId: session.commit.id,
        firstIndex: existing.length,
        entryCount: written.length,
      });
    return yield* copyEntries(written).pipe(Effect.mapError(storeFailure(Store, "append")));
  });

  const driver: Store.Store["Service"] = {
    workspaceId,
    getEntry: Effect.fn("Journal.getEntry")(
      function* (logId, entryId) {
        const space = yield* read;
        const entry = (space.logs.get(logId) ?? [])
          .flatMap((batch) => batch.entries)
          .find((entry) => entry.id === entryId);
        if (entry === undefined) return Option.none();
        return Option.some(yield* copyEntry(entry));
      },
      Effect.mapError(storeFailure(Store, "getEntry")),
    ),
    readFacts: Effect.fn("Journal.readFacts")(
      function* (logId, options) {
        const space = yield* read;
        const matching = (space.logs.get(logId) ?? [])
          .flatMap((batch) => batch.entries)
          .filter(
            (entry) =>
              entry.fact !== undefined &&
              (options.name === undefined || entry.fact.name === options.name) &&
              (options.subject === undefined || entry.fact.subject === options.subject) &&
              (options.version === undefined || entry.fact.version === options.version) &&
              (options.after === undefined || isAfter(entry, options.after)),
          );
        return yield* copyEntries(matching.slice(0, options.limit));
      },
      Effect.mapError(storeFailure(Store, "readFacts")),
    ),
    getAppend: Effect.fn("Journal.getAppend")(
      function* (logId, key) {
        const space = yield* read;
        // Inside a transaction, the lookup holds the log, so it stays true until the commit.
        const session = yield* Effect.serviceOption(Binding.CurrentTransaction);
        if (Option.isSome(session)) yield* hold(session.value, logId);
        return yield* receiptOf(space, logId, key);
      },
      Effect.mapError(storeFailure(Store, "getAppend")),
    ),
    transaction: (program) =>
      transaction(program, (session) => ({
        id: session.commit.id,
        append: (request) => append(session, request),
        afterCommit: (effect) => Binding.afterCommit(session, effect),
      })),
    append: Effect.fn("Journal.appendAlone")(function* (request) {
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* new Store.Failure({
          operation: "append",
          cause: "A standalone append cannot run inside a transaction; use its append",
        });
      // Its own commit, holding only the log: the workspace's transactions do not wait for it.
      return yield* transaction(
        Effect.flatMap(Store.Transaction, (storeTransaction) => storeTransaction.append(request)),
        (session) => ({
          id: session.commit.id,
          append: (input) => append(session, input),
          afterCommit: (effect) => Binding.afterCommit(session, effect),
        }),
        { workspace: false },
      );
    }),
    get: Effect.fn("Journal.get")(
      function* (logId, commitId: Commit.Id) {
        const space = yield* read;
        const batch = (space.logs.get(logId) ?? []).find((batch) => batch.commitId === commitId);
        return batch === undefined
          ? Option.none()
          : Option.some(yield* batchOf(space, logId, batch));
      },
      Effect.mapError(storeFailure(Store, "get")),
    ),
    head: Effect.fn("Journal.head")(
      function* (logId) {
        const space = yield* read;
        return Option.map(Array.last(space.logs.get(logId) ?? []), (batch) => batch.position);
      },
      Effect.mapError(storeFailure(Store, "head")),
    ),
    read: Effect.fn("Journal.read")(
      function* (logId, options) {
        const space = yield* read;
        const after = options.after;
        const selected = (space.logs.get(logId) ?? [])
          .filter((batch) => after === undefined || batch.position > after)
          .slice(0, options.limit);
        return yield* Effect.forEach(selected, (batch) => batchOf(space, logId, batch));
      },
      Effect.mapError(storeFailure(Store, "read")),
    ),
    waitForAppend: Effect.fn("Journal.waitForAppend")(function* (logId, after) {
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* new Store.Failure({
          operation: "waitForAppend",
          cause: "Cannot wait inside a transaction",
        });
      yield* read.pipe(Effect.mapError(storeFailure(Store, "waitForAppend")));
      while (true) {
        // Take the signal before checking committed state, so no append falls between the two.
        const appended = database.appended;
        const last = Array.last(
          MemoryDatabase.committed(database, workspaceId).logs.get(logId) ?? [],
        );
        if (
          Option.isSome(last) &&
          Option.match(after, {
            onNone: () => true,
            onSome: (position) => last.value.position > position,
          })
        )
          return;
        yield* Deferred.await(appended);
      }
    }),
  };
  return Store.make(driver);
});

/**
 * Provide Store.Store using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Store.Store, make());

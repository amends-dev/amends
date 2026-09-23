import { Commit, Entry, Store } from "@amends/core/journal";
import { Array, DateTime, Deferred, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { MemoryDatabase } from "./database.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { keyOf } from "./rows.ts";

const validateAppend = Schema.decodeEffect(Schema.toType(Store.AppendInput));
const validateReadFacts = Schema.decodeEffect(Store.ReadFactsOptions);
const validateRead = Schema.decodeEffect(Store.ReadOptions);
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
  const { workspaceId, connection, read, transaction } = yield* Binding.Service;
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
    const request = yield* validateAppend(input).pipe(
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

  return Store.Service.of({
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
      function* (logId, input) {
        const options = yield* validateReadFacts(input);
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
        return yield* receiptOf(yield* read, logId, key);
      },
      Effect.mapError(storeFailure(Store, "getAppend")),
    ),
    transaction: (program, options) =>
      transaction(
        program,
        (session) => ({ id: session.commit.id, append: (request) => append(session, request) }),
        options,
      ),
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
    read: Effect.fn("Journal.read")(
      function* (logId, input) {
        const options = yield* validateRead(input);
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
  });
});

/**
 * Provide Store.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Store.Service, make());

export * as Journal from "./journal.ts";

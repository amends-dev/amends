import { Array, Context, Effect, Layer, Option, Schema, Stream } from "effect";
import * as Codec from "./Codec.ts";
import * as Commit from "./Commit.ts";
import * as StoredEntry from "./Entry.ts";
import * as Store from "./Store.ts";
import * as Transaction from "./Transaction.ts";

export const Id = StoredEntry.LogId;
export type Id = StoredEntry.LogId;
export const Position = StoredEntry.Position;
export type Position = StoredEntry.Position;
export const IdempotencyKey = Store.IdempotencyKey;
export type IdempotencyKey = Store.IdempotencyKey;

/** A log entry with its payload decoded by the log's schema. */
export interface Entry<A> extends StoredEntry.Metadata {
  readonly payload: A;
}
export interface Batch<A> {
  readonly logId: Id;
  readonly position: Position;
  readonly commit: Commit.Record;
  readonly entries: ReadonlyArray<Entry<A>>;
}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()("Log.InvalidResponse", {
  message: Schema.String,
}) {}
export type WriteError = Transaction.Error | Schema.SchemaError | InvalidResponse;
export type ReadError = Store.Failure | Schema.SchemaError;
export class TailInTransaction extends Schema.TaggedError<TailInTransaction>()(
  "Log.TailInTransaction",
  {},
) {}
export type TailError = ReadError | TailInTransaction;

export interface Handle<S extends Schema.Constraint> {
  readonly id: Id;
  readonly schema: S;
  /** Read the original append slice for a durable key, including own staged writes. */
  readonly getAppend: (
    key: IdempotencyKey,
  ) => Effect.Effect<
    Option.Option<ReadonlyArray<Entry<S["Type"]>>>,
    ReadError,
    S["DecodingServices"]
  >;
  readonly append: (
    value: S["Type"],
    options?: Store.AppendOptions,
  ) => Effect.Effect<Entry<S["Type"]>, WriteError, S["EncodingServices"] | S["DecodingServices"]>;
  readonly appendAll: (
    values: ReadonlyArray<S["Type"]>,
    options?: Store.AppendOptions,
  ) => Effect.Effect<
    ReadonlyArray<Entry<S["Type"]>>,
    WriteError,
    S["EncodingServices"] | S["DecodingServices"]
  >;
  readonly readFacts: (
    options: Store.ReadFactsOptions,
  ) => Effect.Effect<ReadonlyArray<Entry<S["Type"]>>, ReadError, S["DecodingServices"]>;
  readonly get: (
    commitId: Commit.Id,
  ) => Effect.Effect<Option.Option<Batch<S["Type"]>>, ReadError, S["DecodingServices"]>;
  /** Resolve one entry by ID within this log, honoring an enclosing transaction. */
  readonly getEntry: (
    entryId: StoredEntry.Id,
  ) => Effect.Effect<Option.Option<Entry<S["Type"]>>, ReadError, S["DecodingServices"]>;
  readonly read: (
    options: Store.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Batch<S["Type"]>>, ReadError, S["DecodingServices"]>;
  /** The latest batch's position, or None while the log is empty. */
  readonly head: Effect.Effect<Option.Option<Position>, ReadError>;
  /**
   * Replay complete batches until an empty page is observed; this is not a live
   * subscription or a fixed snapshot. Reads use the store's current transaction
   * view. Checkpoint after processing a whole batch.
   */
  readonly stream: (
    options: Store.ReadOptions,
  ) => Stream.Stream<Batch<S["Type"]>, ReadError, S["DecodingServices"]>;
  /**
   * Drain history, then wait for new committed batches until interrupted or failed.
   * Resume after a batch position; omitted after starts at the beginning. Consume
   * outside a transaction. limit bounds each read, not the lifetime of the tail.
   */
  readonly tail: (
    options: Store.ReadOptions,
  ) => Stream.Stream<Batch<S["Type"]>, TailError, S["DecodingServices"]>;
}

/** Domain journals expose their underlying log through this read-only view. */
export type Reader<S extends Schema.Constraint> = Pick<
  Handle<S>,
  "id" | "schema" | "get" | "getEntry" | "getAppend" | "read" | "head" | "stream" | "tail"
>;

export class Log extends Context.Service<
  Log,
  {
    /** Opens a typed handle. Empty logs are created lazily by their first append. */
    readonly open: <S extends Schema.Constraint>(options: {
      readonly id: Id;
      readonly schema: S;
      readonly storageCodec?: Codec.EntryCodec<S>;
    }) => Handle<S>;
    readonly commit: Transaction.Transaction["Service"]["run"];
  }
>()("@amends-dev/core/journal/log/Service") {}

const batchSchema = Schema.toType(Store.Batch).check(
  Schema.makeFilter(({ logId, position, commit, entries }) => {
    if (entries.length > commit.entryCount) return "Log batch exceeds the total commit entry count";
    const ids = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (
        entry.logId !== logId ||
        entry.position !== position ||
        entry.commitId !== commit.id ||
        entry.index !== index
      ) {
        return {
          path: ["entries", index],
          issue: "Entry must match its log batch, commit, and consecutive index",
        };
      }
      if (ids.has(entry.id)) return { path: ["entries", index, "id"], issue: "Duplicate entry id" };
      ids.add(entry.id);
    }
    return undefined;
  }),
);
const validateRead = Schema.decodeEffect(Store.ReadOptions);
const validateAppend = Schema.decodeEffect(Store.AppendOptions);
const validateCommitId = Schema.decodeEffect(Commit.Id);

/**
 * Construct typed logs over host storage and the supplied transaction coordinator.
 *
 * @category constructors
 */
export const make = Effect.fn("Log.make")(function* (): Effect.fn.Return<
  Log["Service"],
  never,
  Store.Store | Transaction.Transaction
> {
  const store = yield* Store.Store;
  const transaction = yield* Transaction.Transaction;

  const open = <S extends Schema.Constraint>({
    id,
    schema,
    storageCodec,
  }: {
    readonly id: Id;
    readonly schema: S;
    readonly storageCodec?: Codec.EntryCodec<S>;
  }): Handle<S> => {
    const codec = storageCodec ?? Codec.makeEntryCodec(schema);
    const ownedBatch = batchSchema.check(
      Schema.makeFilter((batch) =>
        batch.logId === id ? undefined : "Batch belongs to a different log",
      ),
    );
    const decodeEntry = Effect.fnUntraced(function* (entry: Store.Entry) {
      return {
        id: entry.id,
        logId: entry.logId,
        position: entry.position,
        commitId: entry.commitId,
        index: entry.index,
        recordedAt: entry.recordedAt,
        payload: yield* codec.decode(entry),
      };
    });
    const decodeBatch = Effect.fnUntraced(function* (batch: Store.Batch) {
      return {
        logId: batch.logId,
        position: batch.position,
        commit: batch.commit,
        entries: yield* Effect.forEach(batch.entries, decodeEntry),
      };
    });

    const receipt = Effect.fnUntraced(function* (key: IdempotencyKey) {
      const validKey = yield* Schema.decodeEffect(IdempotencyKey)(key);
      return yield* Schema.decodeEffect(
        Schema.Option(
          Schema.toType(Store.AppendReceipt).check(
            Schema.makeFilter((value) =>
              value.logId === id && value.key === validKey
                ? undefined
                : "Append receipt belongs to another log or key",
            ),
          ),
        ),
      )(yield* transaction.step(store.getAppend(id, validKey)));
    });
    const getAppend = Effect.fn("Log.getAppend")(function* (key: IdempotencyKey) {
      const found = yield* receipt(key);
      return Option.isNone(found)
        ? Option.none()
        : Option.some(yield* Effect.forEach(found.value.entries, decodeEntry));
    });

    /**
     * Encode and append through the given store operation, checking that what it returns is
     * the request's content in one consecutive batch of this log, from the expected commit.
     */
    const write = Effect.fnUntraced(function* (
      values: ReadonlyArray<S["Type"]>,
      options: Store.AppendOptions,
      commitId: Commit.Id | undefined,
      store: (request: Store.AppendInput) => Effect.Effect<ReadonlyArray<Store.Entry>, WriteError>,
    ) {
      const request = yield* validateAppend(options);
      const contents = yield* Effect.forEach(values, codec.encode);
      if (request.idempotencyKey !== undefined)
        yield* Schema.decodeUnknownEffect(Schema.NonEmptyArray(Schema.toType(Store.Content)))(
          contents,
        );
      const responseSchema = Schema.Array(Schema.toType(Store.Entry)).check(
        Schema.makeFilter((entries) => {
          if (entries.length !== contents.length)
            return "Append response count does not match the request";
          const ids = new Set<string>();
          let previous: Store.Entry | undefined;
          for (const [index, entry] of entries.entries()) {
            const content = contents[index];
            if (
              entry.logId !== id ||
              (request.idempotencyKey === undefined &&
                commitId !== undefined &&
                entry.commitId !== commitId)
            )
              return "Append returned a different log or commit";
            if (ids.has(entry.id)) return "Append returned duplicate entry ids";
            if (
              previous !== undefined &&
              (entry.commitId !== previous.commitId ||
                entry.position !== previous.position ||
                entry.index !== previous.index + 1)
            ) {
              return "Append entries must be consecutive in one log batch";
            }
            if (content === undefined || !Store.sameContents([content], [entry]))
              return "Append changed the entry content";
            ids.add(entry.id);
            previous = entry;
          }
          return undefined;
        }),
      );
      // The store contract makes the returned entries the key's receipt; the conformance
      // suites check that every adapter keeps it, so appends do not read it back.
      const entries = yield* Schema.decodeEffect(responseSchema)(
        yield* store({ logId: id, entries: contents, ...request }),
      );
      return yield* Effect.forEach(entries, decodeEntry);
    });

    const appendAll = Effect.fn("Log.appendAll")(function* (
      values: ReadonlyArray<S["Type"]>,
      options: Store.AppendOptions = {},
    ) {
      // Outside a commit, the append is a commit of its own. It needs no place in the
      // workspace's write order, so it waits only for this log's other writers.
      if (Option.isNone(yield* Effect.serviceOption(Store.Transaction)))
        return yield* write(values, options, undefined, store.append);
      return yield* transaction.operation(
        Effect.flatMap(Store.Transaction, (storeTransaction) =>
          write(values, options, storeTransaction.id, storeTransaction.append),
        ),
      );
    });

    const append = Effect.fn("Log.append")(function* (
      value: S["Type"],
      options?: Store.AppendOptions,
    ) {
      const entries = yield* appendAll([value], options);
      if (Array.isReadonlyArrayNonEmpty(entries)) return Array.headNonEmpty(entries);
      return yield* new InvalidResponse({ message: "Append returned no entry" });
    });

    const getEntry = Effect.fn("Log.getEntry")(function* (entryId: StoredEntry.Id) {
      const requestedId = yield* Schema.decodeEffect(StoredEntry.Id)(entryId);
      const found = yield* Schema.decodeEffect(
        Schema.Option(
          Schema.toType(Store.Entry).check(
            Schema.makeFilter(
              (entry) =>
                (entry.logId === id && entry.id === requestedId) ||
                "Entry belongs to another log or ID",
            ),
          ),
        ),
      )(yield* transaction.step(store.getEntry(id, requestedId)));
      if (Option.isNone(found)) return Option.none<Entry<S["Type"]>>();
      return Option.some(yield* decodeEntry(found.value));
    });
    const get = Effect.fn("Log.get")(function* (commitId: Commit.Id) {
      const requestedId = yield* validateCommitId(commitId);
      const resultSchema = Schema.Option(
        ownedBatch.check(
          Schema.makeFilter((batch) =>
            batch.commit.id === requestedId ? undefined : "Commit id does not match the request",
          ),
        ),
      );
      const result = yield* Schema.decodeEffect(resultSchema)(
        yield* transaction.step(store.get(id, requestedId)),
      );
      if (Option.isNone(result)) return Option.none<Batch<S["Type"]>>();
      return Option.some(yield* decodeBatch(result.value));
    });

    const head = Effect.flatMap(
      Effect.suspend(() => transaction.step(store.head(id))),
      (position) => Schema.decodeEffect(Schema.Option(Position))(position),
    ).pipe(Effect.withSpan("Log.head"));

    const read = Effect.fn("Log.read")(function* (options: Store.ReadOptions) {
      const request = yield* validateRead(options);
      const resultSchema = Schema.Array(ownedBatch).check(
        Schema.makeFilter((batches) => {
          if (batches.length > request.limit) return "Page exceeds the requested limit";
          let previous = request.after;
          const commits = new Set<string>();
          const entries = new Set<string>();
          for (const batch of batches) {
            if (previous !== undefined && batch.position <= previous)
              return "Log positions must advance beyond the cursor";
            if (commits.has(batch.commit.id)) return "Duplicate commit in log page";
            previous = batch.position;
            commits.add(batch.commit.id);
            for (const entry of batch.entries) {
              if (entries.has(entry.id)) return "Duplicate entry in log page";
              entries.add(entry.id);
            }
          }
          return undefined;
        }),
      );
      const batches = yield* Schema.decodeEffect(resultSchema)(
        yield* transaction.step(store.read(id, request)),
      );
      return yield* Effect.forEach(batches, decodeBatch);
    });

    const stream = (options: Store.ReadOptions) =>
      Stream.paginate(
        options,
        Effect.fnUntraced(function* (cursor) {
          const batches = yield* read(cursor);
          return [
            batches,
            Option.map(Array.last(batches), (batch) => ({
              after: batch.position,
              limit: cursor.limit,
            })),
          ] as const;
        }),
      ).pipe(Stream.withSpan("Log.stream"));

    const tail = (options: Store.ReadOptions) =>
      Stream.paginate(
        options,
        Effect.fnUntraced(function* (cursor) {
          if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
            return yield* new TailInTransaction({});
          while (true) {
            const batches = yield* read(cursor);
            const last = Array.last(batches);
            if (Option.isSome(last)) {
              return [
                batches,
                Option.some({ after: last.value.position, limit: cursor.limit }),
              ] as const;
            }
            yield* store.waitForAppend(id, Option.fromUndefinedOr(cursor.after));
          }
        }),
      ).pipe(Stream.withSpan("Log.tail"));

    const readFacts = Effect.fn("Log.readFacts")(function* (input: Store.ReadFactsOptions) {
      const request = yield* Schema.decodeEffect(Store.ReadFactsOptions)(input);
      const entries = yield* Schema.decodeEffect(
        Schema.Array(Schema.toType(Store.Entry)).check(
          Schema.makeFilter((entries) => {
            if (entries.length > request.limit) return "Page exceeds requested limit";
            let previous = request.after;
            const ids = new Set<string>();
            for (const entry of entries) {
              if (
                entry.logId !== id ||
                entry.fact === undefined ||
                (request.name !== undefined && entry.fact.name !== request.name) ||
                (request.subject !== undefined && entry.fact.subject !== request.subject) ||
                (request.version !== undefined && entry.fact.version !== request.version)
              )
                return "Fact does not match query";
              if (
                previous !== undefined &&
                (entry.position < previous.position ||
                  (entry.position === previous.position && entry.index <= previous.index))
              )
                return "Fact cursor must advance";
              if (ids.has(entry.id)) return "Duplicate entry in fact page";
              ids.add(entry.id);
              previous = entry;
            }
            return undefined;
          }),
        ),
      )(yield* transaction.step(store.readFacts(id, request)));
      return yield* Effect.forEach(entries, decodeEntry);
    });
    return {
      id,
      schema,
      append,
      appendAll,
      get,
      getEntry,
      getAppend,
      read,
      head,
      readFacts,
      stream,
      tail,
    };
  };

  return Log.of({ open, commit: transaction.run });
});

/**
 * Provide typed logs and their shared transaction coordinator over host storage.
 *
 * @category layers
 */
export const layer = Layer.effect(Log, make()).pipe(Layer.provideMerge(Transaction.layer));

import { Array, Context, Effect, Layer, Option, Schema, Stream } from "effect";
import { Codec } from "./codec.ts";
import { Commit } from "./commit.ts";
import { Entry as StoredEntry } from "./entry.ts";
import { Store } from "./store.ts";
import { Transaction } from "./transaction.ts";

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
  ) => Effect.Effect<
    Entry<S["Type"]>,
    WriteError,
    Transaction.Remaining<S["EncodingServices"] | S["DecodingServices"]>
  >;
  readonly appendAll: (
    values: ReadonlyArray<S["Type"]>,
    options?: Store.AppendOptions,
  ) => Effect.Effect<
    ReadonlyArray<Entry<S["Type"]>>,
    WriteError,
    Transaction.Remaining<S["EncodingServices"] | S["DecodingServices"]>
  >;
  readonly get: (
    commitId: Commit.Id,
  ) => Effect.Effect<Option.Option<Batch<S["Type"]>>, ReadError, S["DecodingServices"]>;
  readonly read: (
    options: Store.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Batch<S["Type"]>>, ReadError, S["DecodingServices"]>;
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
  "id" | "schema" | "get" | "getAppend" | "read" | "stream" | "tail"
>;

export interface Interface {
  /** Opens a typed handle. Empty logs are created lazily by their first append. */
  readonly open: <S extends Schema.Constraint>(options: {
    readonly id: Id;
    readonly schema: S;
  }) => Handle<S>;
  readonly commit: Transaction.Interface["run"];
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/log/Service",
) {}

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
  Interface,
  never,
  Store.Service | Transaction.Service
> {
  const store = yield* Store.Service;
  const transaction = yield* Transaction.Service;

  const open = <S extends Schema.Constraint>({
    id,
    schema,
  }: {
    readonly id: Id;
    readonly schema: S;
  }): Handle<S> => {
    const codec = Codec.makeForSchema(schema);
    const ownedBatch = batchSchema.check(
      Schema.makeFilter((batch) =>
        batch.logId === id ? undefined : "Batch belongs to a different log",
      ),
    );
    const decodeEntry = Effect.fnUntraced(function* (entry: StoredEntry.Record) {
      return {
        id: entry.id,
        logId: entry.logId,
        position: entry.position,
        commitId: entry.commitId,
        index: entry.index,
        recordedAt: entry.recordedAt,
        payload: yield* codec.decode(entry.payload),
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
      )(yield* store.getAppend(id, validKey));
    });
    const getAppend = Effect.fn("Log.getAppend")(function* (key: IdempotencyKey) {
      const found = yield* receipt(key);
      return Option.isNone(found)
        ? Option.none()
        : Option.some(yield* Effect.forEach(found.value.entries, decodeEntry));
    });

    const appendAll = Effect.fn("Log.appendAll")(function* (
      values: ReadonlyArray<S["Type"]>,
      options: Store.AppendOptions = {},
    ) {
      return yield* transaction.operation(
        Effect.gen(function* () {
          const request = yield* validateAppend(options);
          const native = yield* Store.Transaction;
          const payloads = yield* Effect.forEach(values, codec.encode);
          if (request.idempotencyKey !== undefined)
            yield* Schema.decodeUnknownEffect(Schema.NonEmptyArray(Schema.Uint8Array))(payloads);
          const responseSchema = Schema.Array(Schema.toType(StoredEntry.Record)).check(
            Schema.makeFilter((entries) => {
              if (entries.length !== payloads.length)
                return "Append response count does not match the request";
              const ids = new Set<string>();
              let previous: StoredEntry.Record | undefined;
              for (const [index, entry] of entries.entries()) {
                const payload = payloads[index];
                if (
                  entry.logId !== id ||
                  (request.idempotencyKey === undefined && entry.commitId !== native.id)
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
                if (
                  payload === undefined ||
                  payload.length !== entry.payload.length ||
                  !payload.every((byte, offset) => byte === entry.payload[offset])
                )
                  return "Append changed the payload bytes";
                ids.add(entry.id);
                previous = entry;
              }
              return undefined;
            }),
          );
          const entries = yield* Schema.decodeEffect(responseSchema)(
            yield* native.append({ logId: id, payloads, ...request }),
          );
          if (request.idempotencyKey !== undefined) {
            const saved = yield* receipt(request.idempotencyKey);
            const sameEntries = Schema.toEquivalence(
              Schema.Array(Schema.toType(StoredEntry.Record)),
            );
            if (Option.isNone(saved) || !sameEntries(entries, saved.value.entries))
              return yield* new InvalidResponse({
                message: "Append result does not match its durable key receipt",
              });
          }
          return yield* Effect.forEach(entries, decodeEntry);
        }),
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

    const get = Effect.fn("Log.get")(function* (commitId: Commit.Id) {
      const requestedId = yield* validateCommitId(commitId);
      const resultSchema = Schema.Option(
        ownedBatch.check(
          Schema.makeFilter((batch) =>
            batch.commit.id === requestedId ? undefined : "Commit id does not match the request",
          ),
        ),
      );
      const result = yield* Schema.decodeEffect(resultSchema)(yield* store.get(id, requestedId));
      if (Option.isNone(result)) return Option.none<Batch<S["Type"]>>();
      return Option.some(yield* decodeBatch(result.value));
    });

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
      const batches = yield* Schema.decodeEffect(resultSchema)(yield* store.read(id, request));
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

    return { id, schema, append, appendAll, get, getAppend, read, stream, tail };
  };

  return Service.of({ open, commit: transaction.run });
});

/**
 * Provide typed logs and their shared transaction coordinator over host storage.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make()).pipe(Layer.provideMerge(Transaction.layer));

export * as Log from "./log.ts";

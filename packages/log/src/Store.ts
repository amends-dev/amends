/**
 * The storage contract for logs, which every storage adapter implements for one space of logs.
 * `Store` appends to and reads the space's logs, opens native transactions, and waits for appends;
 * `Transaction` is the handle a native transaction provides, through which a commit's log appends,
 * and whatever else the host enlists, join one commit. The coordinator in `Transaction.Transaction`
 * runs commits over this contract, and `Log` reads and writes through it; `make` checks every input
 * before an adapter's driver sees it.
 *
 * @since 0.2.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Commit from "./Commit.ts"
import * as LogEntry from "./Entry.ts"
import type * as StoreError from "./StoreError.ts"
import * as StoreInput from "./StoreInput.ts"

/**
 * What an entry stores: its payload, and the name and subject a log may give it, which storage
 * indexes so that `readEntries` can select entries by either.
 *
 * @category schemas
 * @since 0.2.0
 */
export const Content = Schema.Struct({
  payload: Schema.Uint8Array,
  /** What kind of entry it is, such as a fact's name, for logs whose entries have kinds. */
  name: Schema.optionalKey(Schema.NonEmptyString),
  /** What the entry is about, such as a record's `kind:id`, for logs whose entries have subjects. */
  subject: Schema.optionalKey(Schema.NonEmptyString)
})

/**
 * @category schemas
 * @since 0.2.0
 */
export interface Content extends Schema.Schema.Type<typeof Content> {}

/**
 * Complete persisted entry, with queryable metadata beside the payload: its content, where it is,
 * and which commit recorded it.
 *
 * @category schemas
 * @since 0.2.0
 */
export const Entry = Schema.Struct({ ...LogEntry.Metadata.fields, ...Content.fields })

/**
 * @category schemas
 * @since 0.2.0
 */
export interface Entry extends Schema.Schema.Type<typeof Entry> {}

/**
 * An entry's place in its log: its batch's position and its index in that batch. Entry reads page
 * by it, exclusively, so a page can end inside a commit.
 *
 * @category schemas
 * @since 0.2.0
 */
export const Cursor = Schema.Struct({ position: LogEntry.Position, index: Schema.Natural })

/**
 * @category schemas
 * @since 0.2.0
 */
export interface Cursor extends Schema.Schema.Type<typeof Cursor> {}

/**
 * A page of entries: those with a name, a subject, or both, after the exclusive `after` cursor and
 * at most `limit`. Entry pagination is independent of the complete-batch replay cursor.
 *
 * @category options
 * @since 0.2.0
 */
export const EntriesOptions = Schema.Struct({
  name: Schema.optionalKey(Schema.NonEmptyString),
  subject: Schema.optionalKey(Schema.NonEmptyString),
  after: Schema.optionalKey(Cursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
}).check(
  Schema.makeFilter((options) =>
    options.name === undefined && options.subject === undefined ? "A name or subject is required" : undefined
  )
)
/**
 * @category options
 * @since 0.2.0
 */
export interface EntriesOptions extends Schema.Schema.Type<typeof EntriesOptions> {}

/**
 * All entries written to one log by one commit.
 *
 * @category schemas
 * @since 0.2.0
 */
export const Batch = Schema.Struct({
  logId: LogEntry.LogId,
  position: LogEntry.Position,
  commit: Commit.Commit,
  entries: Schema.NonEmptyArray(Entry)
})

/**
 * @category schemas
 * @since 0.2.0
 */
export interface Batch extends Schema.Schema.Type<typeof Batch> {}

/**
 * A page of complete batches: those after the exclusive `after` position, or from the log's
 * beginning, and at most `limit`.
 *
 * @category options
 * @since 0.2.0
 */
export const ReadOptions = Schema.Struct({
  after: Schema.optionalKey(LogEntry.Position),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category options
 * @since 0.2.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * Names one append within a log, so that a retry under the same key returns the original entries
 * instead of appending again. Its encoding is a persistence contract.
 *
 * @category schemas
 * @since 0.2.0
 */
export const IdempotencyKey = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(Schema.brand("LogIdempotencyKey"))

/**
 * @category schemas
 * @since 0.2.0
 */
export type IdempotencyKey = typeof IdempotencyKey.Type

/**
 * How an append is conditioned: on the log's current position, and on whether a key already
 * names it.
 *
 * @category options
 * @since 0.2.0
 */
export const AppendOptions = Schema.Struct({
  /** None requires an empty log; Some requires the specified current position. */
  expectedAfter: Schema.optionalKey(Schema.Option(LogEntry.Position)),
  /**
   * Names the append: a retry with the same content returns the original entries, and different
   * content is rejected.
   */
  idempotencyKey: Schema.optionalKey(IdempotencyKey)
})

/**
 * @category options
 * @since 0.2.0
 */
export interface AppendOptions extends Schema.Schema.Type<typeof AppendOptions> {}

/**
 * One append as storage receives it: the log, the entries' contents in order, and the append's
 * options. A keyed append holds at least one entry.
 *
 * @category options
 * @since 0.2.0
 */
export const AppendInput = Schema.Struct({
  logId: LogEntry.LogId,
  entries: Schema.Array(Content),
  ...AppendOptions.fields
}).check(
  Schema.makeFilter((input) =>
    input.idempotencyKey === undefined || input.entries.length > 0
      ? undefined
      : "A keyed append must contain at least one entry"
  )
)
/**
 * @category options
 * @since 0.2.0
 */
export interface AppendInput extends Schema.Schema.Type<typeof AppendInput> {}

/**
 * A durable key binds the exact slice written by one append, not its entire commit: storage keeps
 * the key with its commit, the first index and count of its slice, and the entries, which a retry
 * returns.
 *
 * @category schemas
 * @since 0.2.0
 */
export const AppendReceipt = Schema.Struct({
  logId: LogEntry.LogId,
  key: IdempotencyKey,
  commitId: Commit.CommitId,
  firstIndex: Schema.Natural,
  entryCount: Schema.Int.check(Schema.isGreaterThan(0)),
  entries: Schema.NonEmptyArray(Entry)
}).check(
  Schema.makeFilter((receipt) => {
    if (receipt.entries.length !== receipt.entryCount) return "Incomplete keyed append receipt"
    const ids = new Set<LogEntry.EntryId>()
    for (const [offset, entry] of receipt.entries.entries()) {
      if (
        entry.logId !== receipt.logId ||
        entry.commitId !== receipt.commitId ||
        entry.position !== receipt.entries[0].position ||
        entry.index !== receipt.firstIndex + offset ||
        ids.has(entry.id)
      )
        return "Entries must match their keyed append receipt"
      ids.add(entry.id)
    }
    return undefined
  })
)
/**
 * @category schemas
 * @since 0.2.0
 */
export interface AppendReceipt extends Schema.Schema.Type<typeof AppendReceipt> {}

/**
 * Compare encoded append intent byte for byte, preserving payload order.
 *
 * @category comparisons
 * @since 0.2.0
 */
export const samePayloads = (left: ReadonlyArray<Uint8Array>, right: ReadonlyArray<Uint8Array>): boolean =>
  left.length === right.length &&
  left.every((bytes, index) => {
    const other = right[index]
    return other !== undefined && bytes.length === other.length && bytes.every((byte, offset) => byte === other[offset])
  })

/**
 * Retries compare the complete content: payloads byte for byte, and names and subjects by value.
 * Storage adapters check a keyed retry against its original append with it.
 *
 * @category comparisons
 * @since 0.2.0
 */
export const sameContents = (left: ReadonlyArray<Content>, right: ReadonlyArray<Content>): boolean =>
  samePayloads(
    left.map((entry) => entry.payload),
    right.map((entry) => entry.payload)
  ) && left.every((entry, index) => entry.name === right[index]?.name && entry.subject === right[index]?.subject)

/**
 * Storage could not confirm whether a commit took effect. `commitId` names it for reconciliation;
 * retrying the same keyed intent reuses a first attempt that committed.
 *
 * @category errors
 * @since 0.2.0
 */
export class CommitUncertain extends Schema.TaggedError<CommitUncertain>()("Store.CommitUncertain", {
  commitId: Commit.CommitId,
  cause: Schema.Defect()
}) {}

/**
 * Host-owned write handle shared by all logs and whatever else the host enlists: the handle of one
 * native transaction, which `Store.transaction` provides to its program. Every log append requires
 * it and enlists in its commit, and a host's own stores may require it too, so that their writes
 * commit with the entries.
 *
 * @category services
 * @since 0.2.0
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    /** The commit's ID, which its entries record. */
    readonly id: Commit.CommitId
    /**
     * Append in request order, assigning unique ids, timestamps, and log positions.
     * Appends to the same log in this transaction share a position and extend its
     * consecutive indexes. Other logs have independent positions. Positions become
     * visible in increasing order, with no late insertion below a visible cursor.
     * Check expectedAfter atomically against the transaction's current log view.
     * Resolve a matching idempotency key first: return its original entries without
     * appending or checking expectedAfter. Different bytes, names, subjects, or count are rejected.
     * Persist the key and append slice in this same transaction; rollback releases it.
     * Copy input bytes and reject expired handles. Returned entries are provisional.
     * Appending to a log holds it against standalone appends until the transaction ends, so its
     * position and keys stay true meanwhile; so does looking up one of its keys in the transaction.
     */
    readonly append: (request: AppendInput) => Effect.Effect<ReadonlyArray<Entry>, StoreError.StoreError>
    /**
     * Run `effect` once this transaction has committed, after it releases what it held; never
     * when it rolls back or its outcome is uncertain. A failure of `effect` is logged and leaves
     * the commit's outcome as it was. For quick notices that something the commit stored can be
     * read now, whose readers would otherwise find it later. Reject expired handles.
     */
    readonly afterCommit: (effect: Effect.Effect<void>) => Effect.Effect<void, StoreError.StoreError>
  }
>()("@amends-dev/log/Store/Transaction") {}

/**
 * What a storage adapter implements for one space of logs. `make` builds the store over a driver
 * of the same shape. It checks every input against its schema before the driver sees it, so a
 * driver keeps only what storage keeps.
 *
 * @category services
 * @since 0.2.0
 */
export class Store extends Context.Service<
  Store,
  {
    /**
     * The receipt of a keyed append, if any, seeing this transaction's staged keys when present.
     * Inside a transaction, it holds the log against standalone appends, as appending does.
     */
    readonly getAppend: (
      logId: LogEntry.LogId,
      key: IdempotencyKey
    ) => Effect.Effect<Option.Option<AppendReceipt>, StoreError.StoreError>
    /**
     * Host transaction primitive. Provides Transaction and enlists all log writes, and whatever
     * else the host's stores write through the handle, in one serializable commit. The
     * coordinator calls this once per outer commit, and issues the commit's log appends and reads
     * one at a time, never concurrently. Do not automatically retry the program. Roll back
     * failures and interruption; report an unconfirmed commit outcome as CommitUncertain with its
     * identity for reconciliation. Persistence across restarts depends on the adapter.
     */
    readonly transaction: <A, E, R>(
      program: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E | StoreError.StoreError | CommitUncertain, Exclude<R, Transaction>>
    /**
     * Append to one log in a commit of its own, outside the space's write order: it waits only
     * for that log's other writers, including a transaction that holds the log, never for the
     * space's transactions. Otherwise as Transaction.append, returning committed entries. For logs
     * written without anything else enlisted, such as execution output. Fail inside a
     * transaction, whose own append joins it instead.
     */
    readonly append: (
      request: AppendInput
    ) => Effect.Effect<ReadonlyArray<Entry>, StoreError.StoreError | CommitUncertain>

    /**
     * One entry of the log by ID, or None. Reads use the current transaction when present,
     * otherwise committed state.
     */
    readonly getEntry: (
      logId: LogEntry.LogId,
      entryId: LogEntry.EntryId
    ) => Effect.Effect<Option.Option<Entry>, StoreError.StoreError>
    /** The batch commit `commitId` appended to the log, or None when it did not touch the log. */
    readonly get: (
      logId: LogEntry.LogId,
      commitId: Commit.CommitId
    ) => Effect.Effect<Option.Option<Batch>, StoreError.StoreError>
    /**
     * The position of this log's latest batch, or None for an empty log. Use the current
     * transaction's view when present, otherwise committed state.
     */
    readonly head: (logId: LogEntry.LogId) => Effect.Effect<Option.Option<LogEntry.Position>, StoreError.StoreError>
    /**
     * Read complete batches for this log after the exclusive cursor, in increasing
     * position order. A commit touching other logs does not appear here. Never split
     * a batch across pages. Empty logs return an empty page. Isolate returned bytes
     * and records from caller mutation.
     */
    readonly read: (
      logId: LogEntry.LogId,
      options: ReadOptions
    ) => Effect.Effect<ReadonlyArray<Batch>, StoreError.StoreError>

    /**
     * Select entries by name, subject, or both, in storage, and page them by (position, index).
     */
    readonly readEntries: (
      logId: LogEntry.LogId,
      options: EntriesOptions
    ) => Effect.Effect<ReadonlyArray<Entry>, StoreError.StoreError>

    /**
     * Wait outside a transaction for committed entries beyond the exclusive cursor
     * (None means any committed batch). Check durable state around subscribing so
     * an append before or during registration cannot be missed. Observe all writers,
     * including other processes and commits whose acknowledgment was lost. Hosts
     * may use notifications, polling, or both; never hold a write transaction while
     * waiting. Wakeups are hints: callers re-read the log. Coalesce notifications
     * instead of buffering entries, and release waiting resources on interruption.
     */
    readonly waitForAppend: (
      logId: LogEntry.LogId,
      after: Option.Option<LogEntry.Position>
    ) => Effect.Effect<void, StoreError.StoreError>
  }
>()("@amends-dev/log/Store") {}

/**
 * Run what a committed transaction's `afterCommit` collected, in order, logging each failure
 * rather than passing it on: the commit already happened. For storage adapters.
 *
 * @category running
 * @since 0.2.0
 */
export const runAfterCommit = (effects: ReadonlyArray<Effect.Effect<void>>) =>
  Effect.forEach(
    effects,
    (effect) => effect.pipe(Effect.catchCause((cause) => Effect.logWarning("Work after a commit failed", cause))),
    { discard: true }
  )

/**
 * The store over a driver: each input is checked against its schema before the driver sees it. A
 * transaction's appends are checked the same way, through the handle the program is given.
 *
 * @category constructors
 * @since 0.2.0
 */
export const make = (driver: Store["Service"]): Store["Service"] => {
  const read = StoreInput.read("Store")
  const write = StoreInput.write("Store")
  const appendInput = (request: AppendInput) => write("append", AppendInput, request)
  const checked = (transaction: Transaction["Service"]): Transaction["Service"] => ({
    id: transaction.id,
    append: (request) => Effect.flatMap(appendInput(request), transaction.append),
    afterCommit: transaction.afterCommit
  })
  return {
    getAppend: Effect.fn("Store.getAppend")(function* (logId, key) {
      return yield* driver.getAppend(
        yield* read("getAppend", LogEntry.LogId, logId),
        yield* read("getAppend", IdempotencyKey, key)
      )
    }),
    transaction: (program) =>
      driver.transaction(
        Effect.flatMap(Transaction, (transaction) => Effect.provideService(program, Transaction, checked(transaction)))
      ),
    append: (request) => Effect.flatMap(appendInput(request), driver.append),
    getEntry: Effect.fn("Store.getEntry")(function* (logId, entryId) {
      return yield* driver.getEntry(
        yield* read("getEntry", LogEntry.LogId, logId),
        yield* read("getEntry", LogEntry.EntryId, entryId)
      )
    }),
    get: Effect.fn("Store.get")(function* (logId, commitId) {
      return yield* driver.get(yield* read("get", LogEntry.LogId, logId), yield* read("get", Commit.CommitId, commitId))
    }),
    head: (logId) => Effect.flatMap(read("head", LogEntry.LogId, logId), driver.head),
    read: Effect.fn("Store.read")(function* (logId, options) {
      return yield* driver.read(yield* read("read", LogEntry.LogId, logId), yield* read("read", ReadOptions, options))
    }),
    readEntries: Effect.fn("Store.readEntries")(function* (logId, options) {
      return yield* driver.readEntries(
        yield* read("readEntries", LogEntry.LogId, logId),
        yield* read("readEntries", EntriesOptions, options)
      )
    }),
    waitForAppend: Effect.fn("Store.waitForAppend")(function* (logId, after) {
      return yield* driver.waitForAppend(
        yield* read("waitForAppend", LogEntry.LogId, logId),
        yield* read("waitForAppend", Schema.Option(LogEntry.Position), after)
      )
    })
  }
}

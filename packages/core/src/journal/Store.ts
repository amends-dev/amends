/**
 * The storage contract for logs, which every storage adapter implements for one workspace. `Store`
 * appends to and reads the workspace's logs, opens native transactions, and waits for appends;
 * `Transaction` is the handle a native transaction provides, through which a commit's log appends,
 * projection store writes, and checkpoint writes enlist in one commit. The coordinator in
 * `Transaction.Transaction` runs commits over this contract, and `Log` reads and writes through
 * it; `make` checks every input before an adapter's driver sees it.
 *
 * @since 0.1.0
 */

import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Commit from "./Commit.ts"
import * as LogEntry from "./Entry.ts"
import * as Event from "./Event.ts"
import * as MemoryDatabase from "./MemoryDatabase.ts"
import * as Occurrence from "./Occurrence.ts"
import * as StoreError from "./StoreError.ts"
import * as StoreInput from "./StoreInput.ts"

/**
 * What an entry stores. Domain journals provide a fact header, `Event.Header`, beside the encoded
 * payload; generic logs provide only payload bytes.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Content = Schema.Struct({
  payload: Schema.Uint8Array,
  fact: Schema.optionalKey(Event.Header)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Content extends Schema.Schema.Type<typeof Content> {}

/**
 * Complete persisted entry, with queryable metadata beside the payload: its content, where it is,
 * and which commit recorded it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Entry = Schema.Struct({ ...LogEntry.Metadata.fields, ...Content.fields })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Entry extends Schema.Schema.Type<typeof Entry> {}

/**
 * An entry's place in its log: its batch's position and its index in that batch. Fact reads page
 * by it, exclusively, so a page can end inside a commit.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Cursor = Schema.Struct({ position: LogEntry.Position, index: Schema.Natural })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Cursor extends Schema.Schema.Type<typeof Cursor> {}

/**
 * A page of fact entries: those matching a name, a subject, or both, and a version only with a
 * name, after the exclusive `after` cursor and at most `limit`. Entry pagination is independent of
 * the complete-batch replay cursor.
 *
 * @category options
 * @since 0.1.0
 */
export const ReadFactsOptions = Schema.Struct({
  name: Schema.optionalKey(Event.Header.fields.name),
  subject: Schema.optionalKey(Event.Header.fields.subject),
  version: Schema.optionalKey(Event.Header.fields.version),
  after: Schema.optionalKey(Cursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
}).check(
  Schema.makeFilter((options) => {
    if (options.name === undefined && options.subject === undefined) return "A fact name or subject is required"
    if (options.version !== undefined && options.name === undefined) return "A fact version requires a fact name"
    return undefined
  })
)
/**
 * @category options
 * @since 0.1.0
 */
export interface ReadFactsOptions extends Schema.Schema.Type<typeof ReadFactsOptions> {}

/**
 * All entries written to one log by one commit.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Batch = Schema.Struct({
  logId: LogEntry.LogId,
  position: LogEntry.Position,
  commit: Commit.Commit,
  entries: Schema.NonEmptyArray(Entry)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Batch extends Schema.Schema.Type<typeof Batch> {}

/**
 * A page of complete batches: those after the exclusive `after` position, or from the log's
 * beginning, and at most `limit`.
 *
 * @category options
 * @since 0.1.0
 */
export const ReadOptions = Schema.Struct({
  after: Schema.optionalKey(LogEntry.Position),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category options
 * @since 0.1.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * How an append is conditioned: on the log's current position, and on whether a key already
 * names it.
 *
 * @category options
 * @since 0.1.0
 */
export const AppendOptions = Schema.Struct({
  /** None requires an empty log; Some requires the specified current position. */
  expectedAfter: Schema.optionalKey(Schema.Option(LogEntry.Position)),
  /**
   * Names the append: a retry with the same content returns the original entries, and different
   * content is rejected.
   */
  idempotencyKey: Schema.optionalKey(Occurrence.Key)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface AppendOptions extends Schema.Schema.Type<typeof AppendOptions> {}

/**
 * One append as storage receives it: the log, the entries' contents in order, and the append's
 * options. A keyed append holds at least one entry.
 *
 * @category options
 * @since 0.1.0
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
 * @since 0.1.0
 */
export interface AppendInput extends Schema.Schema.Type<typeof AppendInput> {}

/**
 * A durable key binds the exact slice written by one append, not its entire commit: storage keeps
 * the key with its commit, the first index and count of its slice, and the entries, which a retry
 * returns.
 *
 * @category schemas
 * @since 0.1.0
 */
export const AppendReceipt = Schema.Struct({
  logId: LogEntry.LogId,
  key: Occurrence.Key,
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
 * @since 0.1.0
 */
export interface AppendReceipt extends Schema.Schema.Type<typeof AppendReceipt> {}

/**
 * Compare encoded append intent byte for byte, preserving payload order.
 *
 * @category comparisons
 * @since 0.1.0
 */
export const samePayloads = (left: ReadonlyArray<Uint8Array>, right: ReadonlyArray<Uint8Array>): boolean =>
  left.length === right.length &&
  left.every((bytes, index) => {
    const other = right[index]
    return other !== undefined && bytes.length === other.length && bytes.every((byte, offset) => byte === other[offset])
  })

const sameHeader = Schema.toEquivalence(Schema.UndefinedOr(Event.Header))

/**
 * Native retries compare the complete content, including structured attribution: payloads byte
 * for byte, and fact headers by value. Storage adapters check a keyed retry against its original
 * append with it.
 *
 * @category comparisons
 * @since 0.1.0
 */
export const sameContents = (left: ReadonlyArray<Content>, right: ReadonlyArray<Content>): boolean =>
  samePayloads(
    left.map((entry) => entry.payload),
    right.map((entry) => entry.payload)
  ) && left.every((entry, index) => sameHeader(entry.fact, right[index]?.fact))

/**
 * Storage could not confirm whether a commit took effect. `commitId` names it for reconciliation;
 * retrying the same keyed intent reuses a first attempt that committed.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommitUncertain extends Schema.TaggedError<CommitUncertain>()("Store.CommitUncertain", {
  commitId: Commit.CommitId,
  cause: Schema.Defect()
}) {}

/**
 * Host-owned write handle shared by all logs and participating projection stores: the handle of
 * one native transaction, which `Store.transaction` provides to its program. Every log append,
 * projection store write, and checkpoint write requires it and enlists in its commit.
 *
 * @category services
 * @since 0.1.0
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
     * appending or checking expectedAfter. Different bytes, fact metadata, or count are rejected.
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
     * read now, such as a request for a runner, whose readers would otherwise find it later.
     * Reject expired handles.
     */
    readonly afterCommit: (effect: Effect.Effect<void>) => Effect.Effect<void, StoreError.StoreError>
  }
>()("@amends-dev/core/journal/Store/Transaction") {}

/**
 * What a storage adapter implements for the journal. `make` builds the store over a driver of
 * the same shape. It checks every input against its schema, and an appended fact
 * against the workspace, before the driver sees it, so a driver keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class Store extends Context.Service<
  Store,
  {
    /** Every log and read addresses this workspace alone. */
    readonly workspaceId: WorkspaceId.WorkspaceId
    /**
     * Lookup is workspace-bound and sees this transaction's staged keys when present. Inside a
     * transaction, it holds the log against standalone appends, as appending does.
     */
    readonly getAppend: (
      logId: LogEntry.LogId,
      key: Occurrence.Key
    ) => Effect.Effect<Option.Option<AppendReceipt>, StoreError.StoreError>
    /**
     * Host transaction primitive. Provides Transaction and enlists all log writes
     * and domain projection stores and checkpoints in one serializable commit.
     * The core transaction coordinator calls this once per outer commit, and issues the commit's
     * log appends and reads one at a time, never concurrently. Do not
     * automatically retry the program. Roll back failures and interruption; report an unconfirmed
     * commit outcome as CommitUncertain with its identity for reconciliation.
     * Persistence across restarts depends on the adapter.
     */
    readonly transaction: <A, E, R>(
      program: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E | StoreError.StoreError | CommitUncertain, Exclude<R, Transaction>>
    /**
     * Append to one log in a commit of its own, outside the workspace's write order: it waits
     * only for that log's other writers, including a transaction that holds the log, never for
     * the workspace's transactions. Otherwise as Transaction.append, returning committed entries.
     * For logs written without projections, such as execution output. Fail inside a transaction,
     * whose own append joins it instead.
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
     * Filter in storage and page individual facts by (position, index), across versions by
     * default.
     */
    readonly readFacts: (
      logId: LogEntry.LogId,
      options: ReadFactsOptions
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
>()("@amends-dev/core/journal/Store") {}

/**
 * Run what a committed transaction's `afterCommit` collected, in order, logging each failure
 * rather than passing it on: the commit already happened. For storage adapters.
 *
 * @category running
 * @since 0.1.0
 */
export const runAfterCommit = (effects: ReadonlyArray<Effect.Effect<void>>) =>
  Effect.forEach(
    effects,
    (effect) => effect.pipe(Effect.catchCause((cause) => Effect.logWarning("Work after a commit failed", cause))),
    { discard: true }
  )

/**
 * The store over a driver: each input is checked against its schema, and an appended fact
 * against the workspace, before the driver sees it. A transaction's appends are checked the same
 * way, through the handle the program is given.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (driver: Store["Service"]): Store["Service"] => {
  const read = StoreInput.read("Store")
  const write = StoreInput.write("Store", driver.workspaceId)
  const appendInput = (request: AppendInput) =>
    write("append", AppendInput, request).pipe(
      Effect.filterOrFail(
        (request) =>
          request.entries.every(
            (entry) => entry.fact === undefined || entry.fact.provenance.workspaceId === driver.workspaceId
          ),
        () => StoreError.rejected("Store", "append", "Fact belongs to another workspace")
      )
    )
  const checked = (transaction: Transaction["Service"]): Transaction["Service"] => ({
    id: transaction.id,
    append: (request) => Effect.flatMap(appendInput(request), transaction.append),
    afterCommit: transaction.afterCommit
  })
  return {
    workspaceId: driver.workspaceId,
    getAppend: Effect.fn("Store.getAppend")(function* (logId, key) {
      return yield* driver.getAppend(
        yield* read("getAppend", LogEntry.LogId, logId),
        yield* read("getAppend", Occurrence.Key, key)
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
    readFacts: Effect.fn("Store.readFacts")(function* (logId, options) {
      return yield* driver.readFacts(
        yield* read("readFacts", LogEntry.LogId, logId),
        yield* read("readFacts", ReadFactsOptions, options)
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

/**
 * One open transaction over memory storage: a snapshot of the workspace that its writes change
 * until it commits. The binding's `transaction` provides it beside `Transaction`, the binding's
 * statements check it against their own, and the memory store reads it to hold logs.
 *
 * @category services
 * @since 0.1.0
 */
export class MemoryTransaction extends Context.Service<
  MemoryTransaction,
  {
    /** The connection that opened it; a handle reaching another connection's binding fails. */
    readonly connection: MemoryDatabase.Connection["Service"]
    readonly workspaceId: WorkspaceId.WorkspaceId
    /** The commit it records, with the count of entries appended so far. */
    readonly commit: Commit.Commit
    /** Its snapshot of the workspace, which its writes change and a commit makes committed. */
    readonly space: MemoryDatabase.Space
    /** Logs this transaction holds against their other writers, released when it ends. */
    readonly held: Set<string>
    /** What `afterCommit` asked to run once the transaction commits, in order. */
    readonly afterCommit: Array<Effect.Effect<void>>
    /** Cleared when the transaction ends, so a handle kept past it fails. */
    active: boolean
  }
>()("@amends-dev/core/journal/Store/MemoryTransaction") {}

/**
 * The memory handle's `afterCommit`: run `effect` once the session's transaction commits. A closed
 * session's handle is expired.
 */
const memoryAfterCommit = (session: MemoryTransaction["Service"], effect: Effect.Effect<void>) =>
  Effect.suspend(() => {
    if (!session.active)
      return Effect.fail(StoreError.failed("Store", "afterCommit")("Missing, closed, or foreign workspace transaction"))
    session.afterCommit.push(effect)
    return Effect.void
  })

/**
 * One workspace's view of memory storage: what a read, a projection write, and a write outside the
 * journal see, and the transaction boundary. `layerMemory` provides it with the workspace's memory
 * store, and every other store's `layerMemory` reads and writes through it.
 *
 * @category services
 * @since 0.1.0
 */
export class MemoryBinding extends Context.Service<
  MemoryBinding,
  {
    /** The workspace every store over this binding reads and writes. */
    readonly workspaceId: WorkspaceId.WorkspaceId
    /** The host's connection: the storage the stores read, and the gate transactions take. */
    readonly connection: MemoryDatabase.Connection["Service"]
    /**
     * What a read sees: the live transaction of this workspace on this connection, or committed
     * state outside any transaction. Any other transaction is a foreign or expired handle.
     */
    readonly read: Effect.Effect<MemoryDatabase.Space, StoreError.StoreError>
    /** What a projection write changes: the caller's transaction, which it requires. */
    readonly write: Effect.Effect<MemoryDatabase.Space, StoreError.StoreError>
    /** What a write outside the journal changes: the caller's transaction, or committed state. */
    readonly join: Effect.Effect<MemoryDatabase.Space, StoreError.StoreError>
    /**
     * Run a write outside the journal that reads before it writes: in the caller's transaction, or
     * else holding the workspace's writer over committed state, so no commit lands in between.
     */
    readonly exclusive: <A, E, R>(
      write: (space: MemoryDatabase.Space) => Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E | StoreError.StoreError, R>
    /**
     * The store's transaction primitive, given how to expose the native handle for the session
     * it opens. See `Store` for the contract. With `workspace: false` it does not take the
     * workspace's writer, for a standalone append that holds only its log, and commits only logs.
     */
    readonly transaction: <A, E, R>(
      program: Effect.Effect<A, E, R>,
      native: (session: MemoryTransaction["Service"]) => Transaction["Service"],
      options?: { readonly workspace?: boolean }
    ) => Effect.Effect<A, E | StoreError.StoreError | CommitUncertain, Exclude<R, Transaction>>
  }
>()("@amends-dev/core/journal/Store/MemoryBinding") {}

/** One workspace's binding over the caller's connection. */
const makeMemoryBinding = Effect.fn("Store.makeMemoryBinding")(function* (workspaceId: WorkspaceId.WorkspaceId) {
  const memoryConnection = yield* MemoryDatabase.Connection
  const { database, gate } = memoryConnection

  /** The caller's live transaction here, None outside any, or a failure for any other. */
  const session = Effect.gen(function* () {
    const current = yield* Effect.serviceOption(MemoryTransaction)
    const native = yield* Effect.serviceOption(Transaction)
    if (Option.isNone(current) && Option.isNone(native)) return Option.none<MemoryTransaction["Service"]>()
    if (
      Option.isNone(current) ||
      Option.isNone(native) ||
      !current.value.active ||
      current.value.connection !== memoryConnection ||
      current.value.workspaceId !== workspaceId ||
      current.value.commit.id !== native.value.id
    )
      return yield* StoreError.failed("Store", "transaction")("Missing, closed, or foreign workspace transaction")
    return current
  })
  const read = Effect.map(session, (current) =>
    Option.isSome(current) ? current.value.space : MemoryDatabase.committed(database, workspaceId)
  )
  const write = Effect.flatMap(session, (current) =>
    Option.isSome(current)
      ? Effect.succeed(current.value.space)
      : Effect.fail(StoreError.failed("Store", "transaction")("Missing, closed, or foreign workspace transaction"))
  )
  const join = Effect.map(session, (current) =>
    Option.isSome(current) ? current.value.space : MemoryDatabase.writable(database, workspaceId)
  )
  /** Take the workspace's writer, which this host's writers wait for and another host's refuse. */
  const acquire = Effect.fnUntraced(function* (
    restore: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  ) {
    yield* restore(gate.take(1))
    if (database.writers.has(workspaceId)) {
      yield* gate.release(1)
      return yield* StoreError.contended("Store", "transaction", "Another host is writing this workspace")
    }
    database.writers.set(workspaceId, memoryConnection)
  })
  const release = Effect.suspend(() => {
    database.writers.delete(workspaceId)
    return gate.release(1)
  })
  const exclusive: MemoryBinding["Service"]["exclusive"] = (write) =>
    Effect.flatMap(session, (current) =>
      Option.isSome(current)
        ? write(current.value.space)
        : Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              yield* acquire(restore)
              const exit = yield* Effect.exit(restore(write(MemoryDatabase.writable(database, workspaceId))))
              yield* release
              return yield* exit
            })
          )
    )

  const transaction: MemoryBinding["Service"]["transaction"] = Effect.fn("Store.memory.transaction")(function* <
    A,
    E,
    R
  >(
    program: Effect.Effect<A, E, R>,
    native: (session: MemoryTransaction["Service"]) => Transaction["Service"],
    options: { readonly workspace?: boolean } = {}
  ) {
    const exclusive = options.workspace !== false
    yield* read
    if (Option.isSome(yield* Effect.serviceOption(Transaction)))
      return yield* StoreError.failed("Store", "transaction")("Native transactions cannot nest; use journal.commit")
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        // This host's writers wait for each other; another host's writer is contention.
        if (exclusive) yield* acquire(restore)
        const state: MemoryTransaction["Service"] = {
          connection: memoryConnection,
          workspaceId,
          active: true,
          commit: {
            id: Commit.CommitId.make(database.nextId("commit")),
            recordedAt: yield* DateTime.now,
            entryCount: 0
          },
          space: MemoryDatabase.copy(MemoryDatabase.committed(database, workspaceId)),
          held: new Set(),
          afterCommit: []
        }
        const exit = yield* Effect.exit(
          restore(
            program.pipe(
              Effect.updateContext((context: Context.Context<R>) => Context.add(context, MemoryTransaction, state)),
              Effect.provideService(Transaction, native(state))
            )
          )
        )
        state.active = false
        // Committing makes the snapshot of what it wrote committed; rolling back drops it.
        if (Exit.isSuccess(exit)) {
          MemoryDatabase.commit(database, workspaceId, state.space, {
            logs: state.held,
            workspace: exclusive
          })
          if ((state.space.commits.get(state.commit.id)?.entryCount ?? 0) > 0)
            MemoryDatabase.wakeAppendReaders(database)
        }
        for (const logId of state.held) yield* MemoryDatabase.logLock(database, workspaceId, logId).release(1)
        if (exclusive) yield* release
        if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause)
        // Committed, with the workspace and its logs released.
        yield* runAfterCommit(state.afterCommit)
        return exit.value
      })
    )
  })

  return MemoryBinding.of({
    workspaceId,
    connection: memoryConnection,
    read,
    write,
    join,
    exclusive,
    transaction
  })
})

const validateReceipt = Schema.decodeUnknownEffect(Schema.toType(AppendReceipt))
/** Decoding builds new objects, so a returned entry shares nothing mutable with storage. */
const decodeEntry = Schema.decodeEffect(Schema.toType(Entry))
const copyEntry = (entry: Entry) => decodeEntry(Object.assign({}, entry, { payload: entry.payload.slice() }))
const copyEntries = (entries: ReadonlyArray<Entry>) => Effect.forEach(entries, copyEntry)

/** Is the cursor (position, index) strictly after the other? */
const isAfter = (entry: Cursor, cursor: Cursor) =>
  entry.position > cursor.position || (entry.position === cursor.position && entry.index > cursor.index)

/** The workspace's logs: appends inside a transaction, reads of committed batches, and waiting. */
const makeMemory = Effect.fn("Store.makeMemory")(function* () {
  const { workspaceId, connection, read, transaction } = yield* MemoryBinding
  const { database } = connection

  /** A log's batch as the contract returns it, with its commit and copied entries. */
  const batchOf = Effect.fnUntraced(function* (
    space: MemoryDatabase.Space,
    logId: LogEntry.LogId,
    batch: MemoryDatabase.Batch
  ) {
    const commit = space.commits.get(batch.commitId)
    const entries = yield* copyEntries(batch.entries)
    if (commit === undefined || !Array.isReadonlyArrayNonEmpty(entries))
      return yield* StoreError.failed("Store", "read")("Incomplete log batch")
    return { logId, position: batch.position, commit: Object.assign({}, commit), entries }
  })

  const receiptOf = Effect.fnUntraced(function* (
    space: MemoryDatabase.Space,
    logId: LogEntry.LogId,
    key: Occurrence.Key
  ) {
    const slice = space.appends.get(MemoryDatabase.keyOf(logId, key))
    if (slice === undefined) return Option.none<AppendReceipt>()
    const batch = (space.logs.get(logId) ?? []).find((batch) => batch.commitId === slice.commitId)
    const entries = yield* copyEntries(
      (batch?.entries ?? []).slice(slice.firstIndex, slice.firstIndex + slice.entryCount)
    )
    return Option.some(yield* validateReceipt({ logId, key, ...slice, entries }))
  })

  /**
   * Hold a log for the rest of the transaction, then bring the snapshot's view of it up to date:
   * its other writers may have committed since the snapshot, and none can until this one ends.
   */
  const hold = Effect.fnUntraced(function* (session: MemoryTransaction["Service"], logId: string) {
    if (session.held.has(logId)) return
    const lock = MemoryDatabase.logLock(database, workspaceId, logId)
    yield* Effect.uninterruptibleMask((restore) =>
      restore(lock.take(1)).pipe(Effect.tap(() => Effect.sync(() => session.held.add(logId))))
    )
    const current = MemoryDatabase.committed(database, workspaceId)
    const batches = current.logs.get(logId)
    if (batches === undefined) return
    session.space.logs.set(logId, batches)
    for (const batch of batches) {
      const commit = current.commits.get(batch.commitId)
      if (commit !== undefined && !session.space.commits.has(batch.commitId))
        session.space.commits.set(batch.commitId, commit)
    }
    for (const [key, slice] of current.appends)
      if (!session.space.appends.has(key)) session.space.appends.set(key, slice)
  })

  const append = Effect.fn("Store.memory.append")(
    function* (session: MemoryTransaction["Service"], request: AppendInput) {
      const current = yield* Effect.serviceOption(MemoryTransaction)
      if (!session.active || Option.isNone(current) || current.value !== session)
        return yield* StoreError.failed("Store", "append")("Closed or foreign append handle")
      yield* hold(session, request.logId)
      const space = session.space
      if (request.idempotencyKey !== undefined) {
        const previous = yield* receiptOf(space, request.logId, request.idempotencyKey)
        if (Option.isSome(previous)) {
          if (!sameContents(request.entries, previous.value.entries))
            return yield* StoreError.rejected(
              "Store",
              "append",
              "Idempotency key is already associated with different content"
            )
          return previous.value.entries
        }
      }
      const batches = space.logs.get(request.logId) ?? []
      const last = Array.last(batches)
      if (request.expectedAfter !== undefined) {
        const actual = Option.map(last, (batch) => batch.position)
        if (!Option.makeEquivalence<number>((a, b) => a === b)(actual, request.expectedAfter))
          return yield* StoreError.contended("Store", "append", "Expected log position changed")
      }
      if (request.entries.length === 0) return []
      // A commit's appends to one log share a position and extend its indexes.
      const open = Option.filter(last, (batch) => batch.commitId === session.commit.id)
      const position = LogEntry.Position.make(
        Option.match(last, {
          onNone: () => 0,
          onSome: (batch) => batch.position + (Option.isSome(open) ? 0 : 1)
        })
      )
      const existing = Option.match(open, { onNone: () => [], onSome: (batch) => batch.entries })
      const recordedAt = yield* DateTime.now
      const written = request.entries.map((content, offset): Entry =>
        Object.assign(
          {
            id: LogEntry.EntryId.make(database.nextId("entry")),
            logId: request.logId,
            position,
            commitId: session.commit.id,
            index: existing.length + offset,
            recordedAt
          },
          content,
          { payload: content.payload.slice() }
        )
      )
      const batch = { position, commitId: session.commit.id, entries: [...existing, ...written] }
      space.logs.set(request.logId, Option.isSome(open) ? [...batches.slice(0, -1), batch] : [...batches, batch])
      const commit = space.commits.get(session.commit.id) ?? session.commit
      space.commits.set(
        session.commit.id,
        Object.assign({}, commit, { entryCount: commit.entryCount + written.length })
      )
      if (request.idempotencyKey !== undefined)
        space.appends.set(MemoryDatabase.keyOf(request.logId, request.idempotencyKey), {
          commitId: session.commit.id,
          firstIndex: existing.length,
          entryCount: written.length
        })
      return yield* copyEntries(written)
    },
    Effect.mapError(StoreError.failed("Store", "append"))
  )

  const driver: Store["Service"] = {
    workspaceId,
    getEntry: Effect.fn("Store.memory.getEntry")(
      function* (logId, entryId) {
        const space = yield* read
        const entry = (space.logs.get(logId) ?? [])
          .flatMap((batch) => batch.entries)
          .find((entry) => entry.id === entryId)
        if (entry === undefined) return Option.none()
        return Option.some(yield* copyEntry(entry))
      },
      Effect.mapError(StoreError.failed("Store", "getEntry"))
    ),
    readFacts: Effect.fn("Store.memory.readFacts")(
      function* (logId, options) {
        const space = yield* read
        const matching = (space.logs.get(logId) ?? [])
          .flatMap((batch) => batch.entries)
          .filter(
            (entry) =>
              entry.fact !== undefined &&
              (options.name === undefined || entry.fact.name === options.name) &&
              (options.subject === undefined || entry.fact.subject === options.subject) &&
              (options.version === undefined || entry.fact.version === options.version) &&
              (options.after === undefined || isAfter(entry, options.after))
          )
        return yield* copyEntries(matching.slice(0, options.limit))
      },
      Effect.mapError(StoreError.failed("Store", "readFacts"))
    ),
    getAppend: Effect.fn("Store.memory.getAppend")(
      function* (logId, key) {
        const space = yield* read
        // Inside a transaction, the lookup holds the log, so it stays true until the commit.
        const session = yield* Effect.serviceOption(MemoryTransaction)
        if (Option.isSome(session)) yield* hold(session.value, logId)
        return yield* receiptOf(space, logId, key)
      },
      Effect.mapError(StoreError.failed("Store", "getAppend"))
    ),
    transaction: (program) =>
      transaction(program, (session) => ({
        id: session.commit.id,
        append: (request) => append(session, request),
        afterCommit: (effect) => memoryAfterCommit(session, effect)
      })),
    append: Effect.fn("Store.memory.appendAlone")(function* (request) {
      if (Option.isSome(yield* Effect.serviceOption(Transaction)))
        return yield* StoreError.failed(
          "Store",
          "append"
        )("A standalone append cannot run inside a transaction; use its append")
      // Its own commit, holding only the log: the workspace's transactions do not wait for it.
      return yield* transaction(
        Effect.flatMap(Transaction, (storeTransaction) => storeTransaction.append(request)),
        (session) => ({
          id: session.commit.id,
          append: (input) => append(session, input),
          afterCommit: (effect) => memoryAfterCommit(session, effect)
        }),
        { workspace: false }
      )
    }),
    get: Effect.fn("Store.memory.get")(
      function* (logId, commitId: Commit.CommitId) {
        const space = yield* read
        const batch = (space.logs.get(logId) ?? []).find((batch) => batch.commitId === commitId)
        return batch === undefined ? Option.none() : Option.some(yield* batchOf(space, logId, batch))
      },
      Effect.mapError(StoreError.failed("Store", "get"))
    ),
    head: Effect.fn("Store.memory.head")(
      function* (logId) {
        const space = yield* read
        return Option.map(Array.last(space.logs.get(logId) ?? []), (batch) => batch.position)
      },
      Effect.mapError(StoreError.failed("Store", "head"))
    ),
    read: Effect.fn("Store.memory.read")(
      function* (logId, options) {
        const space = yield* read
        const after = options.after
        const selected = (space.logs.get(logId) ?? [])
          .filter((batch) => after === undefined || batch.position > after)
          .slice(0, options.limit)
        return yield* Effect.forEach(selected, (batch) => batchOf(space, logId, batch))
      },
      Effect.mapError(StoreError.failed("Store", "read"))
    ),
    waitForAppend: Effect.fn("Store.memory.waitForAppend")(
      function* (logId, after) {
        if (Option.isSome(yield* Effect.serviceOption(Transaction)))
          return yield* StoreError.failed("Store", "waitForAppend")("Cannot wait inside a transaction")
        yield* read
        while (true) {
          // Take the signal before checking committed state, so no append falls between the two.
          const appended = database.appended
          const last = Array.last(MemoryDatabase.committed(database, workspaceId).logs.get(logId) ?? [])
          if (
            Option.isSome(last) &&
            Option.match(after, {
              onNone: () => true,
              onSome: (position) => last.value.position > position
            })
          )
            return
          yield* Deferred.await(appended)
        }
      },
      Effect.mapError(StoreError.failed("Store", "waitForAppend"))
    )
  }
  return make(driver)
})

/**
 * Provide the workspace's logs in process memory, with the `MemoryBinding` every other store's
 * `layerMemory` reads and writes through, over the caller's `MemoryDatabase.Connection`. It keeps
 * what the contract leaves to storage: each commit's entries as one batch per log, the slice each
 * idempotency key wrote, the position an append expected, and the log locks that order writers
 * across hosts. A read sees committed state outside a transaction and the transaction's snapshot
 * inside one. The stores hold no resources, so the scope that builds them can close at once.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = (workspaceId: WorkspaceId.WorkspaceId) =>
  Layer.effect(Store, makeMemory()).pipe(
    Layer.provideMerge(Layer.effect(MemoryBinding, makeMemoryBinding(workspaceId)))
  )

/**
 * `Store` in process memory, the reference implementation of the storage contract. The store
 * `make` builds keeps what the contract leaves to storage: each commit's entries as one batch per
 * log, the slice each idempotency key wrote, and the position an append expected. It runs over a
 * `Binding`: how to read committed state and the live transaction, how to open one, and the locks
 * that order a log's writers. `bind` makes one connection's binding over a `Database` of this
 * process, which several connections may share as hosts share one system, and `layer` gives a store
 * over a database of its own. A host whose memory storage keeps more than logs, such as records
 * committed beside them, provides `Binding` over that storage instead.
 *
 * @since 0.2.0
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
import * as Semaphore from "effect/Semaphore"
import * as Commit from "./Commit.ts"
import * as LogEntry from "./Entry.ts"
import * as Store from "./Store.ts"
import * as StoreError from "./StoreError.ts"

/**
 * One commit's entries in one log, at one position. Stored batches are never changed: a commit's
 * further appends to the log replace its batch with a longer one in the transaction's snapshot.
 *
 * @category models
 * @since 0.2.0
 */
export interface Batch {
  readonly position: LogEntry.Position
  readonly commitId: Commit.CommitId
  readonly entries: ReadonlyArray<Store.Entry>
}

/**
 * The slice of a batch one keyed append wrote: its commit, and where in the batch its entries
 * begin and how many there are. The store returns it as the append's receipt.
 *
 * @category models
 * @since 0.2.0
 */
export interface Append {
  readonly commitId: Commit.CommitId
  readonly firstIndex: number
  readonly entryCount: number
}

/**
 * The logs' stored state. Stored values never change: writes replace values rather than edit them,
 * so a copy of these maps is an isolated snapshot, which is how a transaction stages its writes.
 *
 * @category models
 * @since 0.2.0
 */
export interface Space {
  /** Every commit to the logs by ID, with its entry count. */
  readonly commits: Map<string, Commit.Commit>
  /** Each log's batches in position order. */
  readonly batches: Map<string, ReadonlyArray<Batch>>
  /** Keyed append slices by log and key, as `keyOf` joins them. */
  readonly appends: Map<string, Append>
}

/**
 * Logs with nothing stored.
 *
 * @category constructors
 * @since 0.2.0
 */
export const empty = (): Space => ({ commits: new Map(), batches: new Map(), appends: new Map() })

/**
 * An isolated snapshot: every map is copied, and the values they hold never change.
 *
 * @category transforming
 * @since 0.2.0
 */
export const copy = (space: Space): Space => ({
  commits: new Map(space.commits),
  batches: new Map(space.batches),
  appends: new Map(space.appends)
})

/**
 * Committed state once a transaction's snapshot lands: the logs it held replace the committed
 * ones, other logs keep what their own writers committed meanwhile, and keys and commits combine.
 *
 * @category transforming
 * @since 0.2.0
 */
export const commit = (current: Space, staged: Space, held: ReadonlySet<string>): Space => {
  const batches = new Map(current.batches)
  for (const logId of held) {
    const staging = staged.batches.get(logId)
    if (staging !== undefined) batches.set(logId, staging)
  }
  return {
    batches,
    commits: new Map([...current.commits, ...staged.commits]),
    appends: new Map([...current.appends, ...staged.appends])
  }
}

/**
 * The key of a keyed append's slice in `Space.appends`: its log and idempotency key, unambiguous
 * whatever either contains.
 *
 * @category constructors
 * @since 0.2.0
 */
export const keyOf = (logId: string, key: string): string => JSON.stringify([logId, key])

/**
 * One open transaction as the store sees it: the commit it records, its snapshot of the logs,
 * which its appends change and a commit makes committed, the logs it holds, what to run once it
 * commits, and whether it is still open. A binding opens one for each transaction.
 *
 * @category models
 * @since 0.2.0
 */
export interface Session {
  /** The commit it records; the snapshot's record of it counts the entries appended so far. */
  readonly commit: Commit.Commit
  /** Its snapshot of the logs, which its appends change and a commit makes committed. */
  readonly logs: Space
  /** Logs it holds against their other writers; the binding releases them when it ends. */
  readonly held: Set<string>
  /** What `afterCommit` asked to run once it commits, in order. */
  readonly afterCommit: Array<Effect.Effect<void>>
  /** Cleared when it ends, so a handle kept past it fails. */
  active: boolean
}

/**
 * What the store runs over: how it reads committed state and the live transaction, how it opens
 * one, and the locks that order a log's writers. `bind` makes one over a `Database`; a host whose
 * memory storage keeps more than logs provides one over that storage.
 *
 * @category services
 * @since 0.2.0
 */
export class Binding extends Context.Service<
  Binding,
  {
    /** What a read sees: the caller's live transaction's logs, or committed state outside any. */
    readonly read: Effect.Effect<Space, StoreError.StoreError>
    /** Committed state as it is now, which holding a log and waiting for appends consult. */
    readonly committed: () => Space
    /**
     * The caller's live transaction, None outside any, failing for a transaction this binding did
     * not open or that has ended.
     */
    readonly session: Effect.Effect<Option.Option<Session>, StoreError.StoreError>
    /**
     * Run `program` in a transaction of its own, given how to expose the native handle for the
     * session it opens: see `Store.transaction`. A standalone one takes no writer but its logs'
     * locks, as `Store.append` does, and commits only the logs it holds. Once committed, it
     * releases what it held, wakes waiting readers if it appended, and runs its `afterCommit`.
     */
    readonly transaction: <A, E, R>(
      program: Effect.Effect<A, E, R>,
      native: (session: Session) => Store.Transaction["Service"],
      options: { readonly standalone: boolean }
    ) => Effect.Effect<A, E | StoreError.StoreError | Store.CommitUncertain, Exclude<R, Store.Transaction>>
    /** A log's writer lock, across every host over the same storage. */
    readonly logLock: (logId: string) => Semaphore.Semaphore
    /** Completed, and replaced, whenever a commit appends: take it before checking committed state. */
    readonly appended: () => Deferred.Deferred<void>
    /** An identifier unique within the storage, for commits and entries. */
    readonly nextId: (prefix: string) => string
  }
>()("@amends-dev/log/MemoryStore/Binding") {}

const validateReceipt = Schema.decodeUnknownEffect(Schema.toType(Store.AppendReceipt))
/** Decoding builds new objects, so a returned entry shares nothing mutable with storage. */
const decodeEntry = Schema.decodeEffect(Schema.toType(Store.Entry))
const copyEntry = (entry: Store.Entry) => decodeEntry(Object.assign({}, entry, { payload: entry.payload.slice() }))
const copyEntries = (entries: ReadonlyArray<Store.Entry>) => Effect.forEach(entries, copyEntry)

/** Is the cursor (position, index) strictly after the other? */
const isAfter = (entry: Store.Cursor, cursor: Store.Cursor) =>
  entry.position > cursor.position || (entry.position === cursor.position && entry.index > cursor.index)

const closed = (operation: string) => StoreError.failed("Store", operation)("Missing, closed, or foreign transaction")

/**
 * The store over the caller's `Binding`: appends inside a transaction or alone, reads of committed
 * batches or the transaction's own, and waiting for appends. `Store.make` checks every input first.
 *
 * @category constructors
 * @since 0.2.0
 */
export const make: Effect.Effect<Store.Store["Service"], never, Binding> = Effect.gen(function* () {
  const binding = yield* Binding

  /** A log's batch as the contract returns it, with its commit and copied entries. */
  const batchOf = Effect.fnUntraced(function* (space: Space, logId: LogEntry.LogId, batch: Batch) {
    const commit = space.commits.get(batch.commitId)
    const entries = yield* copyEntries(batch.entries)
    if (commit === undefined || !Array.isReadonlyArrayNonEmpty(entries))
      return yield* StoreError.failed("Store", "read")("Incomplete log batch")
    return { logId, position: batch.position, commit: Object.assign({}, commit), entries }
  })

  const receiptOf = Effect.fnUntraced(function* (space: Space, logId: LogEntry.LogId, key: Store.IdempotencyKey) {
    const slice = space.appends.get(keyOf(logId, key))
    if (slice === undefined) return Option.none<Store.AppendReceipt>()
    const batch = (space.batches.get(logId) ?? []).find((batch) => batch.commitId === slice.commitId)
    const entries = yield* copyEntries(
      (batch?.entries ?? []).slice(slice.firstIndex, slice.firstIndex + slice.entryCount)
    )
    return Option.some(yield* validateReceipt({ logId, key, ...slice, entries }))
  })

  /**
   * Hold a log for the rest of the transaction, then bring the snapshot's view of it up to date:
   * its other writers may have committed since the snapshot, and none can until this one ends.
   */
  const hold = Effect.fnUntraced(function* (session: Session, logId: string) {
    if (session.held.has(logId)) return
    const lock = binding.logLock(logId)
    yield* Effect.uninterruptibleMask((restore) =>
      restore(lock.take(1)).pipe(Effect.tap(() => Effect.sync(() => session.held.add(logId))))
    )
    const current = binding.committed()
    const batches = current.batches.get(logId)
    if (batches === undefined) return
    session.logs.batches.set(logId, batches)
    for (const batch of batches) {
      const commit = current.commits.get(batch.commitId)
      if (commit !== undefined && !session.logs.commits.has(batch.commitId))
        session.logs.commits.set(batch.commitId, commit)
    }
    for (const [key, slice] of current.appends) if (!session.logs.appends.has(key)) session.logs.appends.set(key, slice)
  })

  const append = Effect.fn("MemoryStore.append")(
    function* (session: Session, request: Store.AppendInput) {
      const current = yield* binding.session
      if (!session.active || Option.isNone(current) || current.value !== session) return yield* closed("append")
      yield* hold(session, request.logId)
      const space = session.logs
      if (request.idempotencyKey !== undefined) {
        const previous = yield* receiptOf(space, request.logId, request.idempotencyKey)
        if (Option.isSome(previous)) {
          if (!Store.sameContents(request.entries, previous.value.entries))
            return yield* StoreError.rejected(
              "Store",
              "append",
              "Idempotency key is already associated with different content"
            )
          return previous.value.entries
        }
      }
      const batches = space.batches.get(request.logId) ?? []
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
      const written = request.entries.map((content, offset): Store.Entry =>
        Object.assign(
          {
            id: LogEntry.EntryId.make(binding.nextId("entry")),
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
      space.batches.set(request.logId, Option.isSome(open) ? [...batches.slice(0, -1), batch] : [...batches, batch])
      const commit = space.commits.get(session.commit.id) ?? session.commit
      space.commits.set(
        session.commit.id,
        Object.assign({}, commit, { entryCount: commit.entryCount + written.length })
      )
      if (request.idempotencyKey !== undefined)
        space.appends.set(keyOf(request.logId, request.idempotencyKey), {
          commitId: session.commit.id,
          firstIndex: existing.length,
          entryCount: written.length
        })
      return yield* copyEntries(written)
    },
    Effect.mapError(StoreError.failed("Store", "append"))
  )

  /** The handle a session's program is given: its appends, and work once it commits. */
  const nativeOf = (session: Session): Store.Transaction["Service"] => ({
    id: session.commit.id,
    append: (request) => append(session, request),
    afterCommit: (effect) =>
      Effect.suspend(() => {
        if (!session.active) return Effect.fail(closed("afterCommit"))
        session.afterCommit.push(effect)
        return Effect.void
      })
  })

  const driver: Store.Store["Service"] = {
    getEntry: Effect.fn("MemoryStore.getEntry")(
      function* (logId, entryId) {
        const space = yield* binding.read
        const entry = (space.batches.get(logId) ?? [])
          .flatMap((batch) => batch.entries)
          .find((entry) => entry.id === entryId)
        if (entry === undefined) return Option.none()
        return Option.some(yield* copyEntry(entry))
      },
      Effect.mapError(StoreError.failed("Store", "getEntry"))
    ),
    readEntries: Effect.fn("MemoryStore.readEntries")(
      function* (logId, options) {
        const space = yield* binding.read
        const matching = (space.batches.get(logId) ?? [])
          .flatMap((batch) => batch.entries)
          .filter(
            (entry) =>
              (options.name === undefined || entry.name === options.name) &&
              (options.subject === undefined || entry.subject === options.subject) &&
              (options.after === undefined || isAfter(entry, options.after))
          )
        return yield* copyEntries(matching.slice(0, options.limit))
      },
      Effect.mapError(StoreError.failed("Store", "readEntries"))
    ),
    getAppend: Effect.fn("MemoryStore.getAppend")(
      function* (logId, key) {
        const space = yield* binding.read
        // Inside a transaction, the lookup holds the log, so it stays true until the commit.
        const session = yield* binding.session
        if (Option.isSome(session)) yield* hold(session.value, logId)
        return yield* receiptOf(space, logId, key)
      },
      Effect.mapError(StoreError.failed("Store", "getAppend"))
    ),
    transaction: (program) => binding.transaction(program, nativeOf, { standalone: false }),
    append: Effect.fn("MemoryStore.appendAlone")(function* (request) {
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* StoreError.failed(
          "Store",
          "append"
        )("A standalone append cannot run inside a transaction; use its append")
      // Its own commit, holding only the log: the space's transactions do not wait for it.
      return yield* binding.transaction(
        Effect.flatMap(Store.Transaction, (storeTransaction) => storeTransaction.append(request)),
        nativeOf,
        { standalone: true }
      )
    }),
    get: Effect.fn("MemoryStore.get")(
      function* (logId, commitId: Commit.CommitId) {
        const space = yield* binding.read
        const batch = (space.batches.get(logId) ?? []).find((batch) => batch.commitId === commitId)
        return batch === undefined ? Option.none() : Option.some(yield* batchOf(space, logId, batch))
      },
      Effect.mapError(StoreError.failed("Store", "get"))
    ),
    head: Effect.fn("MemoryStore.head")(
      function* (logId) {
        const space = yield* binding.read
        return Option.map(Array.last(space.batches.get(logId) ?? []), (batch) => batch.position)
      },
      Effect.mapError(StoreError.failed("Store", "head"))
    ),
    read: Effect.fn("MemoryStore.read")(
      function* (logId, options) {
        const space = yield* binding.read
        const after = options.after
        const selected = (space.batches.get(logId) ?? [])
          .filter((batch) => after === undefined || batch.position > after)
          .slice(0, options.limit)
        return yield* Effect.forEach(selected, (batch) => batchOf(space, logId, batch))
      },
      Effect.mapError(StoreError.failed("Store", "read"))
    ),
    waitForAppend: Effect.fn("MemoryStore.waitForAppend")(
      function* (logId, after) {
        if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
          return yield* StoreError.failed("Store", "waitForAppend")("Cannot wait inside a transaction")
        yield* binding.read
        while (true) {
          // Take the signal before checking committed state, so no append falls between the two.
          const appended = binding.appended()
          const last = Array.last(binding.committed().batches.get(logId) ?? [])
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
  return Store.make(driver)
})

/**
 * Logs in this process's memory that several connections share, as hosts share one system: the
 * committed state, which connection's transaction is writing, the logs' locks, and the signal
 * waiting readers take. `makeDatabase` makes an empty one, and `bind` connects to it.
 *
 * @category models
 * @since 0.2.0
 */
export interface Database {
  /** Committed state, replaced as each transaction commits. */
  committed: Space
  /** The connection whose transaction is writing, if any. */
  writer: object | undefined
  /** Each log's writer lock, created on first use. */
  readonly locks: Map<string, Semaphore.Semaphore>
  /** Completed, and replaced, whenever a commit appends. */
  appended: Deferred.Deferred<void>
  /** Issue an identifier unique within this database, for commits and entries. */
  readonly nextId: (prefix: string) => string
}

/**
 * A database with nothing stored and no connection.
 *
 * @category constructors
 * @since 0.2.0
 */
export const makeDatabase: Effect.Effect<Database> = Effect.gen(function* () {
  let issued = 0
  return {
    committed: empty(),
    writer: undefined,
    locks: new Map(),
    appended: yield* Deferred.make<void>(),
    nextId: (prefix) => `${prefix}-${++issued}`
  }
})

/** The memory session the binding provides beside the native handle, so it knows its own. */
class CurrentSession extends Context.Service<CurrentSession, Session>()("@amends-dev/log/MemoryStore/CurrentSession") {}

/**
 * One connection's binding over `database`, as one host's connection to a shared system: this
 * connection's transactions wait for each other, and another connection's writer is contention.
 * A standalone append waits only for its log's other writers, on any connection.
 *
 * @category constructors
 * @since 0.2.0
 */
export const bind = (database: Database): Effect.Effect<Binding["Service"]> =>
  Effect.gen(function* () {
    const connection = {}
    const gate = yield* Semaphore.make(1)
    const logLock = (logId: string) => {
      const existing = database.locks.get(logId)
      if (existing !== undefined) return existing
      const created = Semaphore.makeUnsafe(1)
      database.locks.set(logId, created)
      return created
    }
    const session = Effect.gen(function* () {
      const current = yield* Effect.serviceOption(CurrentSession)
      const native = yield* Effect.serviceOption(Store.Transaction)
      if (Option.isNone(current) && Option.isNone(native)) return Option.none<Session>()
      if (
        Option.isNone(current) ||
        Option.isNone(native) ||
        !current.value.active ||
        current.value.commit.id !== native.value.id
      )
        return yield* closed("transaction")
      return current
    })
    const read = Effect.map(session, (current) => (Option.isSome(current) ? current.value.logs : database.committed))
    const acquire = Effect.fnUntraced(function* (
      restore: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
    ) {
      yield* restore(gate.take(1))
      if (database.writer !== undefined && database.writer !== connection) {
        yield* gate.release(1)
        return yield* StoreError.contended("Store", "transaction", "Another connection is writing")
      }
      database.writer = connection
    })
    const release = Effect.suspend(() => {
      database.writer = undefined
      return gate.release(1)
    })
    const transaction: Binding["Service"]["transaction"] = Effect.fn("MemoryStore.transaction")(function* <A, E, R>(
      program: Effect.Effect<A, E, R>,
      native: (session: Session) => Store.Transaction["Service"],
      options: { readonly standalone: boolean }
    ) {
      yield* read
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* StoreError.failed("Store", "transaction")("Native transactions cannot nest; use Log.commit")
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          if (!options.standalone) yield* acquire(restore)
          const state: Session = {
            active: true,
            commit: {
              id: Commit.CommitId.make(database.nextId("commit")),
              recordedAt: yield* DateTime.now,
              entryCount: 0
            },
            logs: copy(database.committed),
            held: new Set(),
            afterCommit: []
          }
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                Effect.updateContext((context: Context.Context<R>) => Context.add(context, CurrentSession, state)),
                Effect.provideService(Store.Transaction, native(state))
              )
            )
          )
          state.active = false
          if (Exit.isSuccess(exit)) {
            database.committed = commit(database.committed, state.logs, state.held)
            if ((state.logs.commits.get(state.commit.id)?.entryCount ?? 0) > 0) {
              const previous = database.appended
              database.appended = Deferred.makeUnsafe<void>()
              Deferred.doneUnsafe(previous, Effect.void)
            }
          }
          for (const logId of state.held) yield* logLock(logId).release(1)
          if (!options.standalone) yield* release
          if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause)
          yield* Store.runAfterCommit(state.afterCommit)
          return exit.value
        })
      )
    })
    return Binding.of({
      read,
      committed: () => database.committed,
      session,
      transaction,
      logLock,
      appended: () => database.appended,
      nextId: database.nextId
    })
  })

/**
 * Provide `Store.Store` in process memory, over a database of its own with one connection. Nothing
 * survives the layer.
 *
 * **Example** (Typed logs in memory)
 *
 * ```ts
 * import { Entry, Log, MemoryStore } from "@amends-dev/log"
 * import { Effect, Layer, Schema } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const logs = yield* Log.Log
 *   const steps = logs.open({ id: Entry.LogId.make("steps"), schema: Schema.String })
 *   yield* steps.append("started")
 *   return yield* steps.read({ limit: 10 })
 * })
 *
 * program.pipe(Effect.provide(Log.layer.pipe(Layer.provide(MemoryStore.layer))))
 * ```
 *
 * @category layers
 * @since 0.2.0
 */
export const layer: Layer.Layer<Store.Store> = Layer.effect(
  Store.Store,
  Effect.flatMap(makeDatabase, (database) => Effect.provideServiceEffect(make, Binding, bind(database)))
)

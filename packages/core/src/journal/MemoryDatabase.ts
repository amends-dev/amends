/**
 * Storage held in this process's memory, the reference implementation of every storage contract:
 * it enforces with plain maps what the PostgreSQL adapter enforces with keys and indexes. It keeps
 * every workspace's logs, projected records, and read state, and every host connected to it shares
 * them; nothing survives the process. A host connects through a `Connection`; `Store.layerMemory`
 * binds one workspace over it, which each store's `layerMemory` reads and writes through; and the
 * gateway's memory accounts, directory, and sign-in storage keep their `table`s beside it.
 * `makeRows` is how every memory store keeps its records.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"
import * as LocalSignalHub from "../signal/LocalSignalHub.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as Commit from "./Commit.ts"
import type * as Entry from "./Entry.ts"
import type * as Store from "./Store.ts"

/**
 * One commit's entries in one log, at one position. Stored batches are never changed: a commit's
 * further appends to the log replace its batch with a longer one in the transaction's snapshot.
 *
 * @category models
 * @since 0.1.0
 */
export interface Batch {
  readonly position: Entry.Position
  readonly commitId: Commit.Id
  readonly entries: ReadonlyArray<Store.Entry>
}

/**
 * The slice of a batch one keyed append wrote: its commit, and where in the batch its entries
 * begin and how many there are. The memory `Store` returns it as the append's receipt.
 *
 * @category models
 * @since 0.1.0
 */
export interface Append {
  readonly commitId: Commit.Id
  readonly firstIndex: number
  readonly entryCount: number
}

/**
 * Rows of one kind: the JSON of each record's encoded form, by ID. `makeRows` encodes and
 * decodes them.
 *
 * @category models
 * @since 0.1.0
 */
export type Table = Map<string, string>

/**
 * Rows by kind, each kind created the first time it is asked for, like a table of its own. The
 * stores name their kinds, such as `threads` and `threadLatest`.
 *
 * @category models
 * @since 0.1.0
 */
export class Records implements Iterable<Table> {
  readonly #kinds = new Map<string, Table>()
  /** The rows of one kind, created empty the first time they are asked for. */
  of(kind: string): Table {
    const existing = this.#kinds.get(kind)
    if (existing !== undefined) return existing
    const created: Table = new Map()
    this.#kinds.set(kind, created)
    return created
  }
  /** A copy of every kind's rows. */
  copy(): Records {
    const copied = new Records()
    for (const [kind, rows] of this.#kinds) copied.#kinds.set(kind, new Map(rows))
    return copied
  }
  [Symbol.iterator](): Iterator<Table> {
    return this.#kinds.values()
  }
}

/**
 * One workspace's stored state. Stored values never change: records are the JSON of their
 * encoded form, and writes replace values rather than edit them. A copy of these maps is
 * therefore an isolated snapshot, which is how a transaction stages its writes.
 *
 * @category models
 * @since 0.1.0
 */
export interface Space {
  /** Every commit to the workspace's logs by ID, with its entry count. */
  readonly commits: Map<string, Commit.Commit>
  /** Each log's batches in position order. */
  readonly logs: Map<string, ReadonlyArray<Batch>>
  /** Keyed append slices by log and key. */
  readonly appends: Map<string, Append>
  /**
   * Projected records by kind, with the progress of projections being rebuilt and the versions
   * that are live. A rebuild discards these; the journal restores them.
   */
  readonly records: Records
  /** Private read state by member and thread: the sequence read through. Kept through rebuilds. */
  readonly threadPositions: Map<string, number>
  /** Private read state by member and group: when they last read it, in epoch milliseconds. */
  readonly groupTimes: Map<string, number>
  /** Private Seen by notification ID: when its human recipient first saw it. Kept through rebuilds. */
  readonly notificationsSeen: Map<string, number>
  /** Each connection's credential by connection ID, outside the journal, which rebuilds keep. */
  readonly connectionCredentials: Map<string, string>
  /** Each participation's harness session, outside the journal, which rebuilds keep. */
  readonly sessionStates: Map<string, string>
}

/**
 * The storage every connected host shares: each workspace's committed state and who is writing
 * it, the session logs, and the tables and locks beside them. `make` builds an empty one and
 * `layer` provides it; a host connects through a `Connection`.
 *
 * @category services
 * @since 0.1.0
 */
export class MemoryDatabase extends Context.Service<
  MemoryDatabase,
  {
    /** Committed state of each workspace that has any. */
    readonly spaces: Map<WorkspaceId.Id, Space>
    /**
     * The host whose transaction is writing each workspace. Writers to one workspace take turns:
     * a host's own writers wait for each other, and another host's writer reports contention.
     */
    readonly writers: Map<WorkspaceId.Id, object>
    /**
     * Each participation's session log by workspace and participation: its entries' JSON in position
     * order. Session logs take part in no transaction, so they sit beside the workspaces' state.
     */
    readonly sessionLogs: Map<string, ReadonlyArray<string>>
    /**
     * Tables beside the workspaces' state, by name, each created on first use: what a host stores
     * across its workspaces, such as its accounts, as JSON rows by ID.
     */
    readonly tables: Map<string, Table>
    /**
     * Locks by key across every host, each created on first use: a log's writer lock, held by a
     * transaction until it ends, and whatever else changes one at a time.
     */
    readonly locks: Map<string, Semaphore.Semaphore>
    /** Completed, and replaced, whenever a commit or a session log appends; waiting readers observe it. */
    appended: Deferred.Deferred<void>
    /** Every workspace's signals, across every host; signals themselves are never kept. */
    readonly signals: LocalSignalHub.LocalSignalHub
    /** Issue an identifier unique within this storage, for commits and entries. */
    readonly nextId: (prefix: string) => string
  }
>()("@amends-dev/core/journal/MemoryDatabase") {}

/**
 * A workspace with nothing stored, which `committed` reads for one that has no space yet.
 *
 * @category constructors
 * @since 0.1.0
 */
export const empty = (): Space => ({
  commits: new Map(),
  logs: new Map(),
  appends: new Map(),
  records: new Records(),
  threadPositions: new Map(),
  groupTimes: new Map(),
  notificationsSeen: new Map(),
  connectionCredentials: new Map(),
  sessionStates: new Map()
})

/**
 * An isolated snapshot: every map is copied, and the values they hold never change. A transaction
 * runs against one, and `commit` makes it the committed state.
 *
 * @category utils
 * @since 0.1.0
 */
export const copy = (space: Space): Space => ({
  commits: new Map(space.commits),
  logs: new Map(space.logs),
  appends: new Map(space.appends),
  records: space.records.copy(),
  threadPositions: new Map(space.threadPositions),
  groupTimes: new Map(space.groupTimes),
  notificationsSeen: new Map(space.notificationsSeen),
  connectionCredentials: new Map(space.connectionCredentials),
  sessionStates: new Map(space.sessionStates)
})

/**
 * Committed state of one workspace, without creating any: what a read outside a transaction sees,
 * and what a transaction copies when it opens.
 *
 * @category utils
 * @since 0.1.0
 */
export const committed = (database: MemoryDatabase["Service"], workspaceId: WorkspaceId.Id): Space =>
  database.spaces.get(workspaceId) ?? empty()

/**
 * Committed state of one workspace, created on first write: what a write outside a transaction
 * changes, through the binding's `join` and `exclusive`.
 *
 * @category utils
 * @since 0.1.0
 */
export const writable = (database: MemoryDatabase["Service"], workspaceId: WorkspaceId.Id): Space => {
  const existing = database.spaces.get(workspaceId)
  if (existing !== undefined) return existing
  const created = empty()
  database.spaces.set(workspaceId, created)
  return created
}

/**
 * A table beside the workspaces' state, created on first use: where the gateway's memory accounts
 * and sign-in storage keep what a host stores across its workspaces.
 *
 * @category utils
 * @since 0.1.0
 */
export const table = (database: MemoryDatabase["Service"], name: string): Table => {
  const existing = database.tables.get(name)
  if (existing !== undefined) return existing
  const created: Table = new Map()
  database.tables.set(name, created)
  return created
}

/**
 * A lock by key across every host, created on first use, for whatever changes one at a time, such
 * as a sign-in code.
 *
 * @category utils
 * @since 0.1.0
 */
export const lock = (database: MemoryDatabase["Service"], key: string): Semaphore.Semaphore => {
  const existing = database.locks.get(key)
  if (existing !== undefined) return existing
  const created = Semaphore.makeUnsafe(1)
  database.locks.set(key, created)
  return created
}

/** Keep the later of two read-state values for each key. */
const later = (current: Map<string, number>, staged: Map<string, number>) => {
  const merged = new Map(current)
  for (const [key, value] of staged) merged.set(key, Math.max(value, merged.get(key) ?? value))
  return merged
}

/** Keep the earlier of two values for each key: a first time. */
const earlier = (current: Map<string, number>, staged: Map<string, number>) => {
  const merged = new Map(current)
  for (const [key, value] of staged) merged.set(key, Math.min(value, merged.get(key) ?? value))
  return merged
}

/**
 * What a commit wrote: the logs it held, and whether it held the workspace's writer. A standalone
 * append holds only its log.
 *
 * @category models
 * @since 0.1.0
 */
export interface Written {
  readonly logs: ReadonlySet<string>
  readonly workspace: boolean
}

/**
 * Make a transaction's snapshot the committed state of what it wrote. Its logs replace the
 * committed ones it held; other logs keep what their own writers committed meanwhile, and keys
 * and commits combine. Holding the workspace, its records replace the committed ones, and read
 * state keeps the later value of each key, or the earlier first time for Seen.
 *
 * @category utils
 * @since 0.1.0
 */
export const commit = (
  database: MemoryDatabase["Service"],
  workspaceId: WorkspaceId.Id,
  staged: Space,
  written: Written
) => {
  const current = committed(database, workspaceId)
  const logs = new Map(current.logs)
  for (const logId of written.logs) {
    const batches = staged.logs.get(logId)
    if (batches !== undefined) logs.set(logId, batches)
  }
  const shared = {
    logs,
    commits: new Map([...current.commits, ...staged.commits]),
    appends: new Map([...current.appends, ...staged.appends])
  }
  database.spaces.set(
    workspaceId,
    written.workspace
      ? Object.assign({}, staged, shared, {
          threadPositions: later(current.threadPositions, staged.threadPositions),
          groupTimes: later(current.groupTimes, staged.groupTimes),
          notificationsSeen: earlier(current.notificationsSeen, staged.notificationsSeen)
        })
      : Object.assign({}, current, shared)
  )
}

/**
 * A log's writer lock, created on first use. The memory `Store` takes it on a transaction's first
 * append to the log, or lookup of one of its keys, and releases it when the transaction ends.
 *
 * @category utils
 * @since 0.1.0
 */
export const logLock = (database: MemoryDatabase["Service"], workspaceId: WorkspaceId.Id, logId: string) =>
  lock(database, JSON.stringify(["log", workspaceId, logId]))

/**
 * Wake every reader waiting for an append, after a commit with entries or a session log append;
 * the memory `Store` and `SessionLogStore` wait on `appended`
 * for their `waitForAppend`.
 *
 * @category utils
 * @since 0.1.0
 */
export const wakeAppendReaders = (database: MemoryDatabase["Service"]) => {
  const previous = database.appended
  database.appended = Deferred.makeUnsafe<void>()
  Deferred.doneUnsafe(previous, Effect.void)
}

/**
 * Empty storage: no workspace, no table, and no host connected yet.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("MemoryDatabase.make")(function* () {
  let issued = 0
  return MemoryDatabase.of({
    spaces: new Map(),
    writers: new Map(),
    sessionLogs: new Map(),
    tables: new Map(),
    locks: new Map(),
    appended: yield* Deferred.make<void>(),
    signals: yield* LocalSignalHub.make,
    nextId: (prefix) => `${prefix}-${++issued}`
  })
})

/**
 * Provide empty storage for hosts to connect to.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(MemoryDatabase, make())

/**
 * One host's connection to the storage, like one database connection: the storage it reaches, and
 * the gate the host's transactions take turns on, whichever workspace they write.
 * `Store.layerMemory` binds a workspace over it, and the gateway's `WorkspaceStorage.layerMemory`
 * requires it.
 *
 * @category services
 * @since 0.1.0
 */
export class Connection extends Context.Service<
  Connection,
  {
    /** The storage this host connected to, shared with every other host that did. */
    readonly database: MemoryDatabase["Service"]
    /** One permit: held for the whole of each of this host's transactions. */
    readonly gate: Semaphore.Semaphore
  }
>()("@amends-dev/core/journal/MemoryDatabase/Connection") {}

/**
 * Connect to the caller's `MemoryDatabase`, with a gate of this connection's own.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeConnection = Effect.fn("MemoryDatabase.makeConnection")(function* () {
  return Connection.of({
    database: yield* MemoryDatabase,
    gate: yield* Semaphore.make(1)
  })
})

/**
 * Provide a new connection to the caller's storage.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerConnection = Layer.effect(Connection, makeConnection())

/**
 * How one kind of record is stored: the JSON of its encoded form, keyed by ID, one map where the
 * PostgreSQL adapter has one table. Stored strings never change, and every read decodes a fresh
 * record the caller may change freely.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeRows = <A>(codec: Schema.Codec<A, string>) => {
  const decode = Schema.decodeEffect(codec)
  return {
    encode: Schema.encodeEffect(codec),
    decode,
    /** The record stored under `id`, if any. */
    get: (rows: ReadonlyMap<string, string>, id: string) => {
      const row = rows.get(id)
      return row === undefined ? Effect.succeedNone : Effect.asSome(decode(row))
    },
    /** Found records once each, in unspecified order; absent IDs are omitted. */
    getMany: (rows: ReadonlyMap<string, string>, ids: ReadonlyArray<string>) =>
      Effect.forEach(
        [...new Set(ids)].flatMap((id) => {
          const row = rows.get(id)
          return row === undefined ? [] : [row]
        }),
        (row) => decode(row)
      ),
    /** Every stored record, in no promised order; the stores sort what they list. */
    all: (rows: ReadonlyMap<string, string>) => Effect.forEach(rows.values(), (row) => decode(row))
  }
}

/**
 * Order strings by their UTF-8 bytes, as the PostgreSQL adapter's binary collation does, so the
 * memory stores list IDs in the same order.
 *
 * @category utils
 * @since 0.1.0
 */
export const compareBinary = (left: string, right: string): number => {
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    const a = left.codePointAt(i) ?? 0
    const b = right.codePointAt(j) ?? 0
    if (a !== b) return a < b ? -1 : 1
    i += a > 0xffff ? 2 : 1
    j += b > 0xffff ? 2 : 1
  }
  return i < left.length ? 1 : j < right.length ? -1 : 0
}

/**
 * A composite key for maps, unambiguous whatever its parts contain: the read-state maps key by
 * member and thread or group, and the journal's append slices by log and idempotency key.
 *
 * @category utils
 * @since 0.1.0
 */
export const keyOf = (...parts: ReadonlyArray<string | number>): string => JSON.stringify(parts)

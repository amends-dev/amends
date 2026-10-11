/**
 * Storage held in this process's memory. It keeps every workspace's logs, projected records, and
 * read state, and every host connected to it shares them; nothing survives the process. This is
 * the reference implementation of the storage contracts: it enforces what the SQL adapters
 * enforce with plain maps.
 */
import type { Commit, Entry, Store } from "../journal/index.ts";
import { SignalHub } from "../signal/index.ts";
import type { Workspace } from "../workspace/index.ts";
import { Context, Deferred, Effect, Layer, Semaphore } from "effect";

/** One commit's entries in one log, at one position. Stored batches are never changed. */
export interface Batch {
  readonly position: Entry.Position;
  readonly commitId: Commit.Id;
  readonly entries: ReadonlyArray<Store.Entry>;
}

/** The slice of a batch one keyed append wrote. */
export interface Append {
  readonly commitId: Commit.Id;
  readonly firstIndex: number;
  readonly entryCount: number;
}

/** Rows of one kind: the JSON of each record's encoded form, by ID. */
export type Table = Map<string, string>;

/** Rows by kind, each kind created the first time it is asked for, like a table of its own. */
export class Records implements Iterable<Table> {
  readonly #kinds = new Map<string, Table>();
  of(kind: string): Table {
    const existing = this.#kinds.get(kind);
    if (existing !== undefined) return existing;
    const created: Table = new Map();
    this.#kinds.set(kind, created);
    return created;
  }
  /** A copy of every kind's rows. */
  copy(): Records {
    const copied = new Records();
    for (const [kind, rows] of this.#kinds) copied.#kinds.set(kind, new Map(rows));
    return copied;
  }
  [Symbol.iterator](): Iterator<Table> {
    return this.#kinds.values();
  }
}

/**
 * One workspace's stored state. Stored values never change: records are the JSON of their
 * encoded form, and writes replace values rather than edit them. A copy of these maps is
 * therefore an isolated snapshot, which is how a transaction stages its writes.
 */
export interface Space {
  readonly commits: Map<string, Commit.Record>;
  /** Each log's batches in position order. */
  readonly logs: Map<string, ReadonlyArray<Batch>>;
  /** Keyed append slices by log and key. */
  readonly appends: Map<string, Append>;
  /**
   * Projected records by kind, with the progress of projections being rebuilt and the versions
   * that are live. A rebuild discards these; the journal restores them.
   */
  readonly records: Records;
  /** Private read state by member and thread: the sequence read through. Kept through rebuilds. */
  readonly threadPositions: Map<string, number>;
  /** Private read state by member and group: when they last read it, in epoch milliseconds. */
  readonly groupTimes: Map<string, number>;
  /** Private Seen by notification ID: when its human recipient first saw it. Kept through rebuilds. */
  readonly notificationsSeen: Map<string, number>;
  /** Each connection's credential by connection ID, outside the journal, which rebuilds keep. */
  readonly connectionCredentials: Map<string, string>;
  /** Each participation's harness session, outside the journal, which rebuilds keep. */
  readonly sessionStates: Map<string, string>;
}

export interface Interface {
  /** Committed state of each workspace that has any. */
  readonly spaces: Map<Workspace.Id, Space>;
  /**
   * The host whose transaction is writing each workspace. Writers to one workspace take turns:
   * a host's own writers wait for each other, and another host's writer reports contention.
   */
  readonly writers: Map<Workspace.Id, object>;
  /**
   * Each participation's session log by workspace and participation: its entries' JSON in position
   * order. Session logs take part in no transaction, so they sit beside the workspaces' state.
   */
  readonly sessionLogs: Map<string, ReadonlyArray<string>>;
  /**
   * Tables beside the workspaces' state, by name, each created on first use: what a host stores
   * across its workspaces, such as its accounts, as JSON rows by ID.
   */
  readonly tables: Map<string, Table>;
  /**
   * Locks by key across every host, each created on first use: a log's writer lock, held by a
   * transaction until it ends, and whatever else changes one at a time.
   */
  readonly locks: Map<string, Semaphore.Semaphore>;
  /** Completed, and replaced, whenever a commit or a session log appends; waiting readers observe it. */
  appended: Deferred.Deferred<void>;
  /** Every workspace's signals, across every host; signals themselves are never kept. */
  readonly signals: SignalHub.Local;
  /** Issue an identifier unique within this storage, for commits and entries. */
  readonly nextId: (prefix: string) => string;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/memory/MemoryDatabase",
) {}

/** A workspace with nothing stored. */
export const empty = (): Space => ({
  commits: new Map(),
  logs: new Map(),
  appends: new Map(),
  records: new Records(),
  threadPositions: new Map(),
  groupTimes: new Map(),
  notificationsSeen: new Map(),
  connectionCredentials: new Map(),
  sessionStates: new Map(),
});

/** An isolated snapshot: every map is copied, and the values they hold never change. */
export const copy = (space: Space): Space => ({
  commits: new Map(space.commits),
  logs: new Map(space.logs),
  appends: new Map(space.appends),
  records: space.records.copy(),
  threadPositions: new Map(space.threadPositions),
  groupTimes: new Map(space.groupTimes),
  notificationsSeen: new Map(space.notificationsSeen),
  connectionCredentials: new Map(space.connectionCredentials),
  sessionStates: new Map(space.sessionStates),
});

/** Committed state of one workspace, without creating any. */
export const committed = (database: Interface, workspaceId: Workspace.Id): Space =>
  database.spaces.get(workspaceId) ?? empty();

/** Committed state of one workspace, created on first write. */
export const writable = (database: Interface, workspaceId: Workspace.Id): Space => {
  const existing = database.spaces.get(workspaceId);
  if (existing !== undefined) return existing;
  const created = empty();
  database.spaces.set(workspaceId, created);
  return created;
};

/** A table beside the workspaces' state, created on first use. */
export const table = (database: Interface, name: string): Table => {
  const existing = database.tables.get(name);
  if (existing !== undefined) return existing;
  const created: Table = new Map();
  database.tables.set(name, created);
  return created;
};

/** A lock by key across every host, created on first use. */
export const lock = (database: Interface, key: string): Semaphore.Semaphore => {
  const existing = database.locks.get(key);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  database.locks.set(key, created);
  return created;
};

/** Keep the later of two read-state values for each key. */
const later = (current: Map<string, number>, staged: Map<string, number>) => {
  const merged = new Map(current);
  for (const [key, value] of staged) merged.set(key, Math.max(value, merged.get(key) ?? value));
  return merged;
};

/** Keep the earlier of two values for each key: a first time. */
const earlier = (current: Map<string, number>, staged: Map<string, number>) => {
  const merged = new Map(current);
  for (const [key, value] of staged) merged.set(key, Math.min(value, merged.get(key) ?? value));
  return merged;
};

/** What a commit wrote: the logs it held, and whether it held the workspace's writer. */
export interface Written {
  readonly logs: ReadonlySet<string>;
  readonly workspace: boolean;
}

/**
 * Make a transaction's snapshot the committed state of what it wrote. Its logs replace the
 * committed ones it held; other logs keep what their own writers committed meanwhile, and keys
 * and commits combine. Holding the workspace, its records replace the committed ones, and read
 * state keeps the later value of each key, or the earlier first time for Seen.
 */
export const commit = (
  database: Interface,
  workspaceId: Workspace.Id,
  staged: Space,
  written: Written,
) => {
  const current = committed(database, workspaceId);
  const logs = new Map(current.logs);
  for (const logId of written.logs) {
    const batches = staged.logs.get(logId);
    if (batches !== undefined) logs.set(logId, batches);
  }
  const shared = {
    logs,
    commits: new Map([...current.commits, ...staged.commits]),
    appends: new Map([...current.appends, ...staged.appends]),
  };
  database.spaces.set(
    workspaceId,
    written.workspace
      ? Object.assign({}, staged, shared, {
          threadPositions: later(current.threadPositions, staged.threadPositions),
          groupTimes: later(current.groupTimes, staged.groupTimes),
          notificationsSeen: earlier(current.notificationsSeen, staged.notificationsSeen),
        })
      : Object.assign({}, current, shared),
  );
};

/** A log's writer lock, created on first use. */
export const logLock = (database: Interface, workspaceId: Workspace.Id, logId: string) =>
  lock(database, JSON.stringify(["log", workspaceId, logId]));

/** Wake every reader waiting for an append. */
export const wakeAppendReaders = (database: Interface) => {
  const previous = database.appended;
  database.appended = Deferred.makeUnsafe<void>();
  Deferred.doneUnsafe(previous, Effect.void);
};

/**
 * Construct empty storage.
 *
 * @category constructors
 */
export const make = Effect.fn("MemoryDatabase.make")(function* () {
  let issued = 0;
  return Service.of({
    spaces: new Map(),
    writers: new Map(),
    sessionLogs: new Map(),
    tables: new Map(),
    locks: new Map(),
    appended: yield* Deferred.make<void>(),
    signals: yield* SignalHub.makeLocal,
    nextId: (prefix) => `${prefix}-${++issued}`,
  });
});

/**
 * Provide empty storage for hosts to connect to.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as MemoryDatabase from "./database.ts";

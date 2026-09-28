/**
 * Storage held in this process's memory. It keeps every workspace's logs, projected records, and
 * read state, and every host connected to it shares them; nothing survives the process. This is
 * the reference implementation of the storage contracts: it enforces what the SQL adapters
 * enforce with plain maps.
 */
import type { Commit, Entry, Store } from "@amends/core/journal";
import type { Signal } from "@amends/core/signal";
import type { Workspace } from "@amends/core/workspace";
import { Context, Deferred, Effect, Layer, Semaphore } from "effect";
import type { Queue } from "effect";

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

/**
 * Projected records by kind, with the progress of projections being rebuilt and the versions
 * that are live.
 */
export const projections = [
  "workspace",
  "members",
  "roles",
  "builtinRoleRevision",
  "assignments",
  "invitations",
  "notifications",
  "groups",
  "groupLatest",
  "groupMemberships",
  "groupFollows",
  "threads",
  "threadLatest",
  "threadParticipations",
  "threadMessages",
  "threadActivities",
  "connections",
  "environments",
  "agents",
  "turns",
  "checkpoints",
  "liveProjections",
] as const;
export type Projection = (typeof projections)[number];

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
  /** Rows by ID. A rebuild discards these; the journal restores them. */
  readonly records: { readonly [K in Projection]: Map<string, string> };
  /** Private read state by member and thread: the sequence read through. Kept through rebuilds. */
  readonly threadPositions: Map<string, number>;
  /** Private read state by member and group: when they caught up, in epoch milliseconds. */
  readonly groupTimes: Map<string, number>;
  /** Private Seen by notification ID: when its human recipient first saw it. Kept through rebuilds. */
  readonly notificationsSeen: Map<string, number>;
  /** Connections' credentials, outside the journal and its read models, which rebuilds keep. */
  readonly credentials: Map<string, string>;
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
   * Each log's writer lock, across every host: a transaction holds the logs it appends to until
   * it ends, and a standalone append holds its one log.
   */
  readonly logLocks: Map<string, Semaphore.Semaphore>;
  /** Completed, and replaced, whenever a commit appends; waiting readers observe it. */
  appended: Deferred.Deferred<void>;
  /** Each workspace's signal subscribers, across every host; signals themselves are never kept. */
  readonly listeners: Map<Workspace.Id, Set<Queue.Queue<Signal.Value>>>;
  /** Issue an identifier unique within this storage, for commits and entries. */
  readonly nextId: (prefix: string) => string;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/storage-memory/database/Service",
) {}

/** A workspace with nothing stored. */
export const empty = (): Space => ({
  commits: new Map(),
  logs: new Map(),
  appends: new Map(),
  records: Object.fromEntries(projections.map((name) => [name, new Map()])) as Space["records"],
  threadPositions: new Map(),
  groupTimes: new Map(),
  notificationsSeen: new Map(),
  credentials: new Map(),
});

/** An isolated snapshot: every map is copied, and the values they hold never change. */
export const copy = (space: Space): Space => ({
  commits: new Map(space.commits),
  logs: new Map(space.logs),
  appends: new Map(space.appends),
  records: Object.fromEntries(
    projections.map((name) => [name, new Map(space.records[name])]),
  ) as Space["records"],
  threadPositions: new Map(space.threadPositions),
  groupTimes: new Map(space.groupTimes),
  notificationsSeen: new Map(space.notificationsSeen),
  credentials: new Map(space.credentials),
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
export const logLock = (database: Interface, workspaceId: Workspace.Id, logId: string) => {
  const key = JSON.stringify([workspaceId, logId]);
  const existing = database.logLocks.get(key);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  database.logLocks.set(key, created);
  return created;
};

/** Wake every reader waiting for an append. */
export const signalAppend = (database: Interface) => {
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
    logLocks: new Map(),
    appended: yield* Deferred.make<void>(),
    listeners: new Map(),
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

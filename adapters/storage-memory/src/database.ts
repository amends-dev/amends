/**
 * Storage held in this process's memory. It keeps every workspace's logs, projected records, and
 * read state, and every host connected to it shares them; nothing survives the process. This is
 * the reference implementation of the storage contracts: it enforces what the SQL adapters
 * enforce with plain maps.
 */
import type { Commit, Entry, Store } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Context, Deferred, Effect, Layer } from "effect";

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

/** Projected records by kind, with the checkpoints that say how far projections have read. */
export const projections = [
  "workspace",
  "members",
  "roles",
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
  "checkpoints",
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
}

export interface Interface {
  /** Committed state of each workspace that has any. */
  readonly spaces: Map<Workspace.Id, Space>;
  /**
   * The host whose transaction is writing each workspace. Writers to one workspace take turns:
   * a host's own writers wait for each other, and another host's writer reports contention.
   */
  readonly writers: Map<Workspace.Id, object>;
  /** Completed, and replaced, whenever a commit appends; waiting readers observe it. */
  appended: Deferred.Deferred<void>;
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

/**
 * Make a transaction's staged state the workspace's committed state. Only this transaction
 * wrote the journal and projections meanwhile, but read state may have advanced outside it,
 * so read state keeps the later of the two values.
 */
export const commit = (database: Interface, workspaceId: Workspace.Id, staged: Space) => {
  const current = committed(database, workspaceId);
  database.spaces.set(workspaceId, {
    ...staged,
    threadPositions: later(current.threadPositions, staged.threadPositions),
    groupTimes: later(current.groupTimes, staged.groupTimes),
  });
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
    appended: yield* Deferred.make<void>(),
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

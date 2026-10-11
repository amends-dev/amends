/**
 * The storage contract for threads, which every storage adapter implements and `ThreadProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as Thread from "./Thread.ts";
import * as GroupId from "../group/GroupId.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as Group from "../group/Group.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing threads.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ThreadStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, or a missing
 * thread.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The thread store, bound to one workspace by the host.
 *
 * What a storage adapter implements for threads.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadStore extends Context.Service<
  ThreadStore,
  {
    readonly get: (id: Thread.Id) => Effect.Effect<Option.Option<Thread.Thread>, Failure>;
    /**
     * Several threads in one read. Absent IDs are omitted and each found thread appears once; order
     * is unspecified, so callers index results by ID. An empty request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<Thread.Id>,
    ) => Effect.Effect<ReadonlyArray<Thread.Thread>, Failure>;
    /**
     * Every thread of a group in stable ID order. A history read for inspection; operations read
     * pages.
     */
    readonly listByGroup: (id: GroupId.Id) => Effect.Effect<ReadonlyArray<Thread.Thread>, Failure>;
    /**
     * A group's threads with recorded activity, newest latest activity first, then ID in descending
     * binary order, after the exclusive `before` cursor and up to `limit`.
     */
    readonly listByLatest: (
      id: GroupId.Id,
      options: Thread.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.Thread>, Failure>;
    /**
     * A group's threads, newest start first, then ID in descending binary order, after the exclusive
     * `before` cursor and up to `limit`.
     */
    readonly listByStart: (
      id: GroupId.Id,
      options: Thread.OpeningOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.Thread>, Failure>;
    /**
     * Reject reused IDs. The group and creator are recorded as
     * given, checked when the thread starts. Preserve historical values on replay.
     */
    readonly insert: (
      record: Thread.Thread,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Projection write that sets a thread's title. A missing thread conflicts;
     * the same title again changes nothing.
     */
    readonly rename: (
      renamed: Thread.Renamed,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Latest content activity of several threads in one read. Threads without any, and absent IDs,
     * are omitted; order is unspecified.
     */
    readonly getLatest: (
      ids: ReadonlyArray<Thread.Id>,
    ) => Effect.Effect<ReadonlyArray<Thread.Latest>, Failure>;
    /**
     * Projection write that advances a thread's latest content activity. A position at or before the
     * recorded one changes nothing; a missing thread conflicts.
     */
    readonly recordLatest: (
      latest: Thread.Latest,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/thread/ThreadStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ThreadStore["Service"],
): ThreadStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Thread.Id, id), driver.get),
    getMany: (ids) => Effect.flatMap(read("getMany", Schema.Array(Thread.Id), ids), driver.getMany),
    listByGroup: (id) => Effect.flatMap(read("listByGroup", GroupId.Id, id), driver.listByGroup),
    listByLatest: Effect.fn("ThreadStore.listByLatest")(function* (id, options) {
      return yield* driver.listByLatest(
        yield* read("listByLatest", GroupId.Id, id),
        yield* read("listByLatest", Thread.ListOptions, options),
      );
    }),
    listByStart: Effect.fn("ThreadStore.listByStart")(function* (id, options) {
      return yield* driver.listByStart(
        yield* read("listByStart", GroupId.Id, id),
        yield* read("listByStart", Thread.OpeningOptions, options),
      );
    }),
    insert: (record) => Effect.flatMap(write("insert", Thread.Thread, record), driver.insert),
    rename: (renamed) => Effect.flatMap(write("rename", Thread.Renamed, renamed), driver.rename),
    getLatest: (ids) =>
      Effect.flatMap(read("getLatest", Schema.Array(Thread.Id), ids), driver.getLatest),
    recordLatest: (latest) =>
      Effect.flatMap(write("recordLatest", Thread.Latest, latest), driver.recordLatest),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Thread.Thread));
const latestRows = MemoryDatabase.makeRows(Schema.fromJsonString(Thread.Latest));

/** Newest time first, then ID in descending binary order. */
const newestFirst = (
  left: { readonly at: number; readonly id: string },
  right: { readonly at: number; readonly id: string },
) => right.at - left.at || MemoryDatabase.compareBinary(right.id, left.id);

/**
 * Threads over the current workspace transaction, which `ThreadProjection` writes.
 */
const makeMemory = Effect.fn("ThreadStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const inGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const records = yield* rows.all((yield* read).records.of("threads"));
    return records.filter((record) => record.groupId === groupId);
  });
  const driver: ThreadStore["Service"] = {
    get: Effect.fn("ThreadStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threads"), id);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    getMany: Effect.fn("ThreadStore.memory.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("threads"), ids);
      },
      Effect.mapError(storeFailure(Failure, "getMany")),
    ),
    listByGroup: Effect.fn("ThreadStore.memory.listByGroup")(
      function* (groupId) {
        return (yield* inGroup(groupId)).toSorted((left, right) =>
          MemoryDatabase.compareBinary(left.id, right.id),
        );
      },
      Effect.mapError(storeFailure(Failure, "listByGroup")),
    ),
    listByLatest: Effect.fn("ThreadStore.memory.listByLatest")(
      function* (groupId, options) {
        const threads = yield* inGroup(groupId);
        const latest = new Map(
          (yield* latestRows.getMany(
            (yield* read).records.of("threadLatest"),
            threads.map((thread) => thread.id),
          )).map((value) => [value.threadId, DateTime.toEpochMillis(value.occurredAt)]),
        );
        const before = Option.fromUndefinedOr(options.before).pipe(
          Option.map((cursor) => ({
            at: DateTime.toEpochMillis(cursor.latestActivityAt),
            id: cursor.threadId,
          })),
        );
        return threads
          .flatMap((thread) => {
            const at = latest.get(thread.id);
            return at === undefined ? [] : [{ thread, at, id: thread.id }];
          })
          .filter((entry) => Option.isNone(before) || newestFirst(entry, before.value) > 0)
          .toSorted(newestFirst)
          .slice(0, options.limit)
          .map(({ thread }) => thread);
      },
      Effect.mapError(storeFailure(Failure, "listByLatest")),
    ),
    listByStart: Effect.fn("ThreadStore.memory.listByStart")(
      function* (groupId, options) {
        const before = Option.fromUndefinedOr(options.before).pipe(
          Option.map((cursor) => ({
            at: DateTime.toEpochMillis(cursor.createdAt),
            id: cursor.threadId,
          })),
        );
        return (yield* inGroup(groupId))
          .map((thread) => ({
            thread,
            at: DateTime.toEpochMillis(thread.createdAt),
            id: thread.id,
          }))
          .filter((entry) => Option.isNone(before) || newestFirst(entry, before.value) > 0)
          .toSorted(newestFirst)
          .slice(0, options.limit)
          .map(({ thread }) => thread);
      },
      Effect.mapError(storeFailure(Failure, "listByStart")),
    ),
    getLatest: Effect.fn("ThreadStore.memory.getLatest")(
      function* (ids) {
        return yield* latestRows.getMany((yield* read).records.of("threadLatest"), ids);
      },
      Effect.mapError(storeFailure(Failure, "getLatest")),
    ),
    recordLatest: Effect.fn("ThreadStore.memory.recordLatest")(function* (latest) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "recordLatest")));
      if (!space.records.of("threads").has(latest.threadId))
        return yield* new Conflict({
          operation: "recordLatest",
          message: "Thread is missing",
        });
      const current = yield* latestRows
        .get(space.records.of("threadLatest"), latest.threadId)
        .pipe(Effect.mapError(storeFailure(Failure, "recordLatest")));
      // Only a later position advances; an earlier one changes nothing.
      if (Option.isSome(current) && latest.sequence <= current.value.sequence) return;
      const row = yield* latestRows
        .encode(latest)
        .pipe(Effect.mapError(storeFailure(Failure, "recordLatest")));
      space.records.of("threadLatest").set(latest.threadId, row);
    }),
    rename: Effect.fn("ThreadStore.memory.rename")(function* (renamed) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "rename")));
      const found = yield* rows
        .get(space.records.of("threads"), renamed.threadId)
        .pipe(Effect.mapError(storeFailure(Failure, "rename")));
      if (Option.isNone(found))
        return yield* new Conflict({
          operation: "rename",
          message: "Thread is missing",
        });
      const row = yield* rows
        .encode({ ...found.value, title: renamed.title })
        .pipe(Effect.mapError(storeFailure(Failure, "rename")));
      space.records.of("threads").set(renamed.threadId, row);
    }),
    insert: Effect.fn("ThreadStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("threads").has(record.id))
        return yield* new Conflict({
          operation: "insert",
          message: "Thread ID already exists",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("threads").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `ThreadStore` in process memory, over the workspace's `Store.MemoryBinding`: thread
 * records, and each thread's latest content activity as a row of its own. It keeps what the
 * contract leaves to storage: a reused ID conflicts; renaming or recording latest activity
 * conflicts for a missing thread; and a latest position at or before the recorded one changes
 * nothing. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ThreadStore, makeMemory());

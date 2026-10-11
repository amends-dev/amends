/**
 * The storage contract for threads, which every storage adapter implements and `ThreadProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/store.ts";

import * as Thread from "./Thread.ts";
import * as GroupId from "../group/id.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/id.ts";

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
    readonly get: (id: Thread.Id) => Effect.Effect<Option.Option<Thread.Record>, Failure>;
    /**
     * Several threads in one read. Absent IDs are omitted and each found thread appears once; order
     * is unspecified, so callers index results by ID. An empty request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<Thread.Id>,
    ) => Effect.Effect<ReadonlyArray<Thread.Record>, Failure>;
    /**
     * Every thread of a group in stable ID order. A history read for inspection; operations read
     * pages.
     */
    readonly listByGroup: (id: GroupId.Id) => Effect.Effect<ReadonlyArray<Thread.Record>, Failure>;
    /**
     * A group's threads with recorded activity, newest latest activity first, then ID in descending
     * binary order, after the exclusive `before` cursor and up to `limit`.
     */
    readonly listByLatest: (
      id: GroupId.Id,
      options: Thread.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.Record>, Failure>;
    /**
     * A group's threads, newest start first, then ID in descending binary order, after the exclusive
     * `before` cursor and up to `limit`.
     */
    readonly listByStart: (
      id: GroupId.Id,
      options: Thread.OpeningOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.Record>, Failure>;
    /**
     * Reject reused IDs. The group and creator are recorded as
     * given, checked when the thread starts. Preserve historical values on replay.
     */
    readonly insert: (
      record: Thread.Record,
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
    insert: (record) => Effect.flatMap(write("insert", Thread.Record, record), driver.insert),
    rename: (renamed) => Effect.flatMap(write("rename", Thread.Renamed, renamed), driver.rename),
    getLatest: (ids) =>
      Effect.flatMap(read("getLatest", Schema.Array(Thread.Id), ids), driver.getLatest),
    recordLatest: (latest) =>
      Effect.flatMap(write("recordLatest", Thread.Latest, latest), driver.recordLatest),
  };
};

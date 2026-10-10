/**
 * The storage contract for threads, which every storage adapter implements and `ThreadProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { Thread } from "./Thread.ts";
import type { GroupId } from "../group/id.ts";

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
 * What a storage adapter implements for threads.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
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
   * Reject malformed or foreign records and reused IDs. The group and creator are recorded as
   * given, checked when the thread starts. Preserve historical values on replay.
   */
  readonly insert: (
    record: Thread.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Projection write that sets a thread's title. A missing, foreign, or malformed thread conflicts;
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
   * recorded one changes nothing; a missing, foreign, or malformed thread conflicts.
   */
  readonly recordLatest: (
    latest: Thread.Latest,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

/**
 * The thread store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/thread/ThreadStore",
) {}

export * as ThreadStore from "./ThreadStore.ts";

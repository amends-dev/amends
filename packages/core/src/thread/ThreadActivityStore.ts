/**
 * The storage contract for activity, a thread's timeline, which every storage adapter implements
 * and `ThreadActivityProjection` writes. Reads honor the caller's transaction when there is one;
 * writes require it. The store keeps each timeline contiguous from position 1, and checks what it
 * is given; it authorizes nobody, operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type { Store } from "../journal/store.ts";

import { ThreadActivity } from "./ThreadActivity.ts";
import { ThreadId } from "./ThreadId.ts";
import { StoreInput } from "../journal/StoreInput.ts";
import type { WorkspaceId } from "../workspace/id.ts";

/**
 * One page of a thread's timeline, always in ascending sequence order. The range lies strictly
 * after `afterSequence` (zero or omitted: from the first activity) and strictly before
 * `beforeSequence` (omitted: through the latest). The page holds the range's oldest `limit`
 * activities, or with `from: "newest"` its newest, so a view can open at the latest activity and
 * page back by passing its first item's sequence as `beforeSequence`.
 *
 * @category options
 * @since 0.1.0
 */
export const ReadOptions = Schema.Struct({
  afterSequence: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  beforeSequence: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  from: Schema.optionalKey(Schema.Literals(["oldest", "newest"])),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter(
    ({ afterSequence, beforeSequence }) =>
      afterSequence === undefined ||
      beforeSequence === undefined ||
      beforeSequence > afterSequence ||
      "beforeSequence must come after afterSequence",
  ),
);

/**
 * @category options
 * @since 0.1.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * Storage failed while reading or writing activity.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ThreadActivityStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID or occurrence
 * key, or a position other than the thread's next.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ThreadActivityStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * What a storage adapter implements for activity.
 *
 * @category services
 * @since 0.1.0
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
  readonly get: (
    id: ThreadActivity.Id,
  ) => Effect.Effect<Option.Option<ThreadActivity.Record>, Failure>;
  /**
   * A thread's whole timeline in sequence order. A history read for inspection; operations read
   * pages.
   */
  readonly listByThread: (
    id: ThreadId.Id,
  ) => Effect.Effect<ReadonlyArray<ThreadActivity.Record>, Failure>;
  /** Latest activity in this thread, using the caller's transaction when present. */
  readonly latest: (
    id: ThreadId.Id,
  ) => Effect.Effect<Option.Option<ThreadActivity.Record>, Failure>;
  /**
   * The first activity of several threads in one read. Absent IDs are omitted and each thread
   * appears once; order is unspecified.
   */
  readonly getFirst: (
    ids: ReadonlyArray<ThreadId.Id>,
  ) => Effect.Effect<ReadonlyArray<ThreadActivity.Record>, Failure>;
  /**
   * At most limit activities of the requested range, from its requested end, in ascending
   * sequence order. No shared snapshot across pages.
   */
  readonly readPage: (
    id: ThreadId.Id,
    options: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<ThreadActivity.Record>, Failure>;
  /**
   * Reject reused IDs, a position other than the thread's next, and a
   * second activity with one occurrence key. The subject is recorded as given, checked when the
   * activity is recorded. Preserve historical values on replay.
   */
  readonly insert: (
    record: ThreadActivity.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

/**
 * The activity store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/thread/ThreadActivityStore",
) {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", ThreadActivity.Id, id), driver.get),
    listByThread: (id) =>
      Effect.flatMap(read("listByThread", ThreadId.Id, id), driver.listByThread),
    latest: (id) => Effect.flatMap(read("latest", ThreadId.Id, id), driver.latest),
    getFirst: (ids) =>
      Effect.flatMap(read("getFirst", Schema.Array(ThreadId.Id), ids), driver.getFirst),
    readPage: Effect.fn("ThreadActivityStore.readPage")(function* (id, options) {
      return yield* driver.readPage(
        yield* read("readPage", ThreadId.Id, id),
        yield* read("readPage", ReadOptions, options),
      );
    }),
    insert: (record) =>
      Effect.flatMap(write("insert", ThreadActivity.Record, record), driver.insert),
  };
};

export * as ThreadActivityStore from "./ThreadActivityStore.ts";

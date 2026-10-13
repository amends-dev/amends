/**
 * The storage contract for activity, a thread's timeline, which every storage adapter implements
 * and `ThreadActivityProjection` writes. Reads honor the caller's transaction when there is one;
 * writes require it. The store keeps each timeline contiguous from position 1, and checks what it
 * is given; it authorizes nobody, operations do that.
 *
 * @since 0.1.0
 */

import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Store from "../journal/Store.ts"
import * as StoreError from "../journal/StoreError.ts"
import * as StoreInput from "../journal/StoreInput.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ThreadActivity from "./ThreadActivity.ts"
import * as ThreadId from "./ThreadId.ts"

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
  limit: Schema.Int.check(Schema.isGreaterThan(0))
}).check(
  Schema.makeFilter(
    ({ afterSequence, beforeSequence }) =>
      afterSequence === undefined ||
      beforeSequence === undefined ||
      beforeSequence > afterSequence ||
      "beforeSequence must come after afterSequence"
  )
)

/**
 * @category options
 * @since 0.1.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * The activity store, bound to one workspace by the host.
 *
 * What a storage adapter implements for activity.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadActivityStore extends Context.Service<
  ThreadActivityStore,
  {
    readonly get: (
      id: ThreadActivity.ThreadActivityId
    ) => Effect.Effect<Option.Option<ThreadActivity.ThreadActivity>, StoreError.StoreError>
    /**
     * A thread's whole timeline in sequence order. A history read for inspection; operations read
     * pages.
     */
    readonly listByThread: (
      id: ThreadId.ThreadId
    ) => Effect.Effect<ReadonlyArray<ThreadActivity.ThreadActivity>, StoreError.StoreError>
    /** Latest activity in this thread, using the caller's transaction when present. */
    readonly latest: (
      id: ThreadId.ThreadId
    ) => Effect.Effect<Option.Option<ThreadActivity.ThreadActivity>, StoreError.StoreError>
    /**
     * The first activity of several threads in one read. Absent IDs are omitted and each thread
     * appears once; order is unspecified.
     */
    readonly getFirst: (
      ids: ReadonlyArray<ThreadId.ThreadId>
    ) => Effect.Effect<ReadonlyArray<ThreadActivity.ThreadActivity>, StoreError.StoreError>
    /**
     * At most limit activities of the requested range, from its requested end, in ascending
     * sequence order. No shared snapshot across pages.
     */
    readonly readPage: (
      id: ThreadId.ThreadId,
      options: ReadOptions
    ) => Effect.Effect<ReadonlyArray<ThreadActivity.ThreadActivity>, StoreError.StoreError>
    /**
     * Reject reused IDs, a position other than the thread's next, and a
     * second activity with one occurrence key. The subject is recorded as given, checked when the
     * activity is recorded. Preserve historical values on replay.
     */
    readonly insert: (
      record: ThreadActivity.ThreadActivity
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/thread/ThreadActivityStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.WorkspaceId,
  driver: ThreadActivityStore["Service"]
): ThreadActivityStore["Service"] => {
  const read = StoreInput.read("ThreadActivityStore")
  const write = StoreInput.write("ThreadActivityStore", workspaceId)
  return {
    get: (id) => Effect.flatMap(read("get", ThreadActivity.ThreadActivityId, id), driver.get),
    listByThread: (id) => Effect.flatMap(read("listByThread", ThreadId.ThreadId, id), driver.listByThread),
    latest: (id) => Effect.flatMap(read("latest", ThreadId.ThreadId, id), driver.latest),
    getFirst: (ids) => Effect.flatMap(read("getFirst", Schema.Array(ThreadId.ThreadId), ids), driver.getFirst),
    readPage: Effect.fn("ThreadActivityStore.readPage")(function* (id, options) {
      return yield* driver.readPage(
        yield* read("readPage", ThreadId.ThreadId, id),
        yield* read("readPage", ReadOptions, options)
      )
    }),
    insert: (record) => Effect.flatMap(write("insert", ThreadActivity.ThreadActivity, record), driver.insert)
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(ThreadActivity.ThreadActivity))
const bySequence = (left: ThreadActivity.ThreadActivity, right: ThreadActivity.ThreadActivity) =>
  left.sequence - right.sequence

/**
 * Each thread's activity over the current workspace transaction, which
 * `ThreadActivityProjection` writes.
 */
const makeMemory = Effect.fn("ThreadActivityStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding
  const inThread = Effect.fnUntraced(function* (threadId: ThreadId.ThreadId) {
    const records = yield* rows.all((yield* read).records.of("threadActivities"))
    return records.filter((record) => record.threadId === threadId).toSorted(bySequence)
  })
  const driver: ThreadActivityStore["Service"] = {
    get: Effect.fn("ThreadActivityStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threadActivities"), id)
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "get"))
    ),
    listByThread: Effect.fn("ThreadActivityStore.memory.listByThread")(
      function* (input) {
        return yield* inThread(input)
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "listByThread"))
    ),
    latest: Effect.fn("ThreadActivityStore.memory.latest")(
      function* (input) {
        return Array.last(yield* inThread(input))
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "latest"))
    ),
    getFirst: Effect.fn("ThreadActivityStore.memory.getFirst")(
      function* (input) {
        const ids = new Set(input)
        if (ids.size === 0) return []
        // Recording keeps each timeline contiguous from 1, so its first activity is at 1.
        return (yield* rows.all((yield* read).records.of("threadActivities"))).filter(
          (record) => ids.has(record.threadId) && record.sequence === 1
        )
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "getFirst"))
    ),
    readPage: Effect.fn("ThreadActivityStore.memory.readPage")(
      function* (id, request) {
        const before = request.beforeSequence
        const range = (yield* inThread(id)).filter(
          (record) =>
            record.sequence > (request.afterSequence ?? 0) && (before === undefined || record.sequence < before)
        )
        return request.from === "newest"
          ? range.slice(Math.max(0, range.length - request.limit))
          : range.slice(0, request.limit)
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "readPage"))
    ),
    insert: Effect.fn("ThreadActivityStore.memory.insert")(
      function* (record) {
        const space = yield* write
        const activities = yield* rows.all(space.records.of("threadActivities"))
        const timeline = activities.filter((activity) => activity.threadId === record.threadId)
        const next = timeline.reduce((latest, activity) => Math.max(latest, activity.sequence), 0) + 1
        if (record.sequence !== next)
          return yield* StoreError.rejected(
            "ThreadActivityStore",
            "insert",
            "Activity must follow the current thread sequence"
          )
        if (
          space.records.of("threadActivities").has(record.id) ||
          (record.occurrence !== null && activities.some((activity) => activity.occurrence === record.occurrence))
        )
          return yield* StoreError.rejected(
            "ThreadActivityStore",
            "insert",
            "Activity ID reused, or its occurrence is already recorded"
          )
        const row = yield* rows.encode(record)
        space.records.of("threadActivities").set(record.id, row)
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "insert"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `ThreadActivityStore` in process memory, over the workspace's `Store.MemoryBinding`: each
 * thread's timeline. It keeps what the contract leaves to storage: an activity is rejected unless
 * its sequence follows the thread's last, so each timeline stays contiguous from 1, and a reused
 * ID, or a second activity for one occurrence, is rejected. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ThreadActivityStore, makeMemory())

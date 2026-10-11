/**
 * The memory implementation of `ThreadActivityStore` from `../thread/ThreadActivityStore.ts`, over
 * the workspace's `Binding`: each thread's timeline. It keeps what the contract leaves to storage:
 * an activity conflicts unless its sequence follows the thread's last, so each timeline stays
 * contiguous from 1, and a reused ID, or a second activity for one occurrence, conflicts.
 * `ThreadActivityStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Thread, ThreadActivity, ThreadActivityStore } from "../thread/index.ts";
import { Array, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(ThreadActivity.ThreadActivity));
const bySequence = (left: ThreadActivity.ThreadActivity, right: ThreadActivity.ThreadActivity) =>
  left.sequence - right.sequence;

/**
 * Each thread's activity over the current workspace transaction, which
 * `ThreadActivityProjection` writes.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadActivities.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const inThread = Effect.fnUntraced(function* (threadId: Thread.Id) {
    const records = yield* rows.all((yield* read).records.of("threadActivities"));
    return records.filter((record) => record.threadId === threadId).toSorted(bySequence);
  });
  const driver: ThreadActivityStore.ThreadActivityStore["Service"] = {
    get: Effect.fn("ThreadActivities.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("threadActivities"), id);
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "get")),
    ),
    listByThread: Effect.fn("ThreadActivities.listByThread")(
      function* (input) {
        return yield* inThread(input);
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "listByThread")),
    ),
    latest: Effect.fn("ThreadActivities.latest")(
      function* (input) {
        return Array.last(yield* inThread(input));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "latest")),
    ),
    getFirst: Effect.fn("ThreadActivities.getFirst")(
      function* (input) {
        const ids = new Set(input);
        if (ids.size === 0) return [];
        // Recording keeps each timeline contiguous from 1, so its first activity is at 1.
        return (yield* rows.all((yield* read).records.of("threadActivities"))).filter(
          (record) => ids.has(record.threadId) && record.sequence === 1,
        );
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "getFirst")),
    ),
    readPage: Effect.fn("ThreadActivities.readPage")(
      function* (id, request) {
        const before = request.beforeSequence;
        const range = (yield* inThread(id)).filter(
          (record) =>
            record.sequence > (request.afterSequence ?? 0) &&
            (before === undefined || record.sequence < before),
        );
        return request.from === "newest"
          ? range.slice(Math.max(0, range.length - request.limit))
          : range.slice(0, request.limit);
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "readPage")),
    ),
    insert: Effect.fn("ThreadActivities.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadActivityStore, "insert")));
      const activities = yield* rows
        .all(space.records.of("threadActivities"))
        .pipe(Effect.mapError(storeFailure(ThreadActivityStore, "insert")));
      const timeline = activities.filter((activity) => activity.threadId === record.threadId);
      const next =
        timeline.reduce((latest, activity) => Math.max(latest, activity.sequence), 0) + 1;
      if (record.sequence !== next)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Activity must follow the current thread sequence",
        });
      if (
        space.records.of("threadActivities").has(record.id) ||
        (record.occurrence !== null &&
          activities.some((activity) => activity.occurrence === record.occurrence))
      )
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Activity ID reused, or its occurrence is already recorded",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadActivityStore, "insert")));
      space.records.of("threadActivities").set(record.id, row);
    }),
  };
  return ThreadActivityStore.make(workspaceId, driver);
});
/**
 * Provide activity storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadActivityStore.ThreadActivityStore, make());

/**
 * The storage contract for tasks, which every storage adapter implements and `TaskProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as GroupId from "../group/GroupId.ts";
import * as Store from "../journal/Store.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as Task from "./Task.ts";
import { storeFailure } from "../journal/internal/storeFailure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing tasks.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("TaskStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a thread that has a task
 * already, or a change to a task that is missing or does not hold the value the change replaces.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("TaskStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The task store, bound to one workspace by the host.
 *
 * What a storage adapter implements for tasks.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class TaskStore extends Context.Service<
  TaskStore,
  {
    /** The thread's task, if it has one. */
    readonly get: (threadId: ThreadId.Id) => Effect.Effect<Option.Option<Task.Task>, Failure>;
    /**
     * Several threads' tasks in one read. Threads without one are omitted and each task appears
     * once; order is unspecified, so callers index results by thread. An empty request reads
     * nothing.
     */
    readonly getMany: (
      threadIds: ReadonlyArray<ThreadId.Id>,
    ) => Effect.Effect<ReadonlyArray<Task.Task>, Failure>;
    /**
     * A page of a group's tasks by creation, newest first, after the exclusive cursor, of one status
     * when the options name one.
     */
    readonly listByGroup: (
      groupId: GroupId.Id,
      options: Task.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Task.Task>, Failure>;
    /** Reject a thread that has a task. */
    readonly insert: (
      record: Task.Task,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Apply one change to a thread's task. A thread without a task, or a task whose value is not
     * the one the change replaces, conflicts.
     */
    readonly apply: (
      threadId: ThreadId.Id,
      change: Task.Change,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/task/TaskStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: TaskStore["Service"],
): TaskStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (threadId) => Effect.flatMap(read("get", ThreadId.Id, threadId), driver.get),
    getMany: (threadIds) =>
      Effect.flatMap(read("getMany", Schema.Array(ThreadId.Id), threadIds), driver.getMany),
    listByGroup: Effect.fn("TaskStore.listByGroup")(function* (groupId, options) {
      return yield* driver.listByGroup(
        yield* read("listByGroup", GroupId.Id, groupId),
        yield* read("listByGroup", Task.ListOptions, options),
      );
    }),
    insert: (record) => Effect.flatMap(write("insert", Task.Task, record), driver.insert),
    apply: Effect.fn("TaskStore.apply")(function* (threadId, change) {
      return yield* driver.apply(
        yield* write("apply", ThreadId.Id, threadId),
        yield* write("apply", Task.Change, change),
      );
    }),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Task.Task));

/** Newest creation first, then thread ID in descending binary order. */
const newestFirst = (
  left: { readonly at: number; readonly id: string },
  right: { readonly at: number; readonly id: string },
) => right.at - left.at || MemoryDatabase.compareBinary(right.id, left.id);

/**
 * Tasks by thread, over one workspace's binding.
 */
const makeMemory = Effect.fn("TaskStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const driver: TaskStore["Service"] = {
    get: Effect.fn("TaskStore.memory.get")(
      function* (threadId) {
        return yield* rows.get((yield* read).records.of("tasks"), threadId);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    getMany: Effect.fn("TaskStore.memory.getMany")(
      function* (threadIds) {
        return yield* rows.getMany((yield* read).records.of("tasks"), threadIds);
      },
      Effect.mapError(storeFailure(Failure, "getMany")),
    ),
    listByGroup: Effect.fn("TaskStore.memory.listByGroup")(
      function* (groupId, options) {
        const before = Option.fromUndefinedOr(options.before).pipe(
          Option.map((cursor) => ({
            at: DateTime.toEpochMillis(cursor.createdAt),
            id: cursor.threadId,
          })),
        );
        return (yield* rows.all((yield* read).records.of("tasks")))
          .filter(
            (task) =>
              task.groupId === groupId &&
              (options.status === undefined || task.status === options.status),
          )
          .map((task) => ({ task, at: DateTime.toEpochMillis(task.createdAt), id: task.threadId }))
          .filter((entry) => Option.isNone(before) || newestFirst(entry, before.value) > 0)
          .toSorted(newestFirst)
          .slice(0, options.limit)
          .map(({ task }) => task);
      },
      Effect.mapError(storeFailure(Failure, "listByGroup")),
    ),
    insert: Effect.fn("TaskStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("tasks").has(record.threadId))
        return yield* new Conflict({
          operation: "insert",
          message: "Thread already has a task",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("tasks").set(record.threadId, row);
    }),
    apply: Effect.fn("TaskStore.memory.apply")(function* (threadId, change) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "apply")));
      const found = yield* rows
        .get(space.records.of("tasks"), threadId)
        .pipe(Effect.mapError(storeFailure(Failure, "apply")));
      if (Option.isNone(found) || Task.valueOf(found.value, change) !== change.from)
        return yield* new Conflict({
          operation: "apply",
          message: "Expected a task holding the value the change replaces",
        });
      const row = yield* rows
        .encode(Task.apply(found.value, change))
        .pipe(Effect.mapError(storeFailure(Failure, "apply")));
      space.records.of("tasks").set(threadId, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `TaskStore` in process memory, over the workspace's `Store.MemoryBinding`: tasks keyed by
 * their thread. It keeps what the contract leaves to storage: a second task for one thread
 * conflicts, and a change applies only to a stored task that still holds the value the change
 * replaces, so a change made against a stale value conflicts. A group's tasks list newest first,
 * then by thread ID in descending binary order. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(TaskStore, makeMemory());

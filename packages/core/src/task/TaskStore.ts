/**
 * The storage contract for tasks, which every storage adapter implements and `TaskProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import * as GroupId from "../group/GroupId.ts";
import type * as Store from "../journal/Store.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as Task from "./Task.ts";

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
    readonly get: (threadId: ThreadId.Id) => Effect.Effect<Option.Option<Task.Record>, Failure>;
    /**
     * Several threads' tasks in one read. Threads without one are omitted and each task appears
     * once; order is unspecified, so callers index results by thread. An empty request reads
     * nothing.
     */
    readonly getMany: (
      threadIds: ReadonlyArray<ThreadId.Id>,
    ) => Effect.Effect<ReadonlyArray<Task.Record>, Failure>;
    /**
     * A page of a group's tasks by creation, newest first, after the exclusive cursor, of one status
     * when the options name one.
     */
    readonly listByGroup: (
      groupId: GroupId.Id,
      options: Task.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Task.Record>, Failure>;
    /** Reject a thread that has a task. */
    readonly insert: (
      record: Task.Record,
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
    insert: (record) => Effect.flatMap(write("insert", Task.Record, record), driver.insert),
    apply: Effect.fn("TaskStore.apply")(function* (threadId, change) {
      return yield* driver.apply(
        yield* write("apply", ThreadId.Id, threadId),
        yield* write("apply", Task.Change, change),
      );
    }),
  };
};

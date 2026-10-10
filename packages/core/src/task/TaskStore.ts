/**
 * The storage contract for tasks, which every storage adapter implements and `TaskProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { GroupId } from "../group/id.ts";
import type { Store } from "../journal/store.ts";
import type { ThreadId } from "../thread/ThreadId.ts";
import type { Task } from "./Task.ts";

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
 * What a storage adapter implements for tasks.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
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
  /** Reject malformed or foreign records, and a thread that has a task. */
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

/**
 * The task store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@amends/core/task/TaskStore") {}

export * as TaskStore from "./TaskStore.ts";

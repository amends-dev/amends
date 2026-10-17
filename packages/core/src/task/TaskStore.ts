/**
 * The storage contract for tasks, which every storage adapter implements and `TaskProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import type * as Store from "@amends-dev/log/Store"
import * as StoreError from "@amends-dev/log/StoreError"
import * as StoreInput from "@amends-dev/log/StoreInput"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as MemoryBinding from "../journal/MemoryBinding.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Task from "./Task.ts"

/**
 * The task store, bound to one workspace by the host: what a storage adapter implements for tasks.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema, and a record against the workspace, before the driver sees it, so a driver keeps only
 * what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class TaskStore extends Context.Service<
  TaskStore,
  {
    /** The thread's task, if it has one. */
    readonly get: (threadId: ThreadId.ThreadId) => Effect.Effect<Option.Option<Task.Task>, StoreError.StoreError>
    /**
     * Several threads' tasks in one read. Threads without one are omitted and each task appears
     * once; order is unspecified, so callers index results by thread. An empty request reads
     * nothing.
     */
    readonly getMany: (
      threadIds: ReadonlyArray<ThreadId.ThreadId>
    ) => Effect.Effect<ReadonlyArray<Task.Task>, StoreError.StoreError>
    /**
     * A page of a group's tasks by creation, newest first, after the exclusive cursor, of one status
     * when the options name one.
     */
    readonly listByGroup: (
      groupId: GroupId.GroupId,
      options: Task.ListOptions
    ) => Effect.Effect<ReadonlyArray<Task.Task>, StoreError.StoreError>
    /** Reject a thread that has a task. */
    readonly insert: (record: Task.Task) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Apply one change to a thread's task. A thread without a task, or a task whose value is not
     * the one the change replaces, is rejected.
     */
    readonly apply: (
      threadId: ThreadId.ThreadId,
      change: Task.Change
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/task/TaskStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.WorkspaceId, driver: TaskStore["Service"]): TaskStore["Service"] => {
  const read = StoreInput.read("TaskStore")
  const write = StoreInput.write("TaskStore", WorkspaceId.rejectForeign(workspaceId))
  return {
    get: (threadId) => Effect.flatMap(read("get", ThreadId.ThreadId, threadId), driver.get),
    getMany: (threadIds) => Effect.flatMap(read("getMany", Schema.Array(ThreadId.ThreadId), threadIds), driver.getMany),
    listByGroup: Effect.fn("TaskStore.listByGroup")(function* (groupId, options) {
      return yield* driver.listByGroup(
        yield* read("listByGroup", GroupId.GroupId, groupId),
        yield* read("listByGroup", Task.ListOptions, options)
      )
    }),
    insert: (record) => Effect.flatMap(write("insert", Task.Task, record), driver.insert),
    apply: Effect.fn("TaskStore.apply")(function* (threadId, change) {
      return yield* driver.apply(
        yield* write("apply", ThreadId.ThreadId, threadId),
        yield* write("apply", Task.Change, change)
      )
    })
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Task.Task))

/** Newest creation first, then thread ID in descending binary order. */
const newestFirst = (
  left: { readonly at: number; readonly id: string },
  right: { readonly at: number; readonly id: string }
) => right.at - left.at || MemoryDatabase.compareBinary(right.id, left.id)

/**
 * Tasks by thread, over one workspace's binding.
 */
const makeMemory = Effect.fn("TaskStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* MemoryBinding.MemoryBinding
  const driver: TaskStore["Service"] = {
    get: Effect.fn("TaskStore.memory.get")(
      function* (threadId) {
        return yield* rows.get((yield* read).records.of("tasks"), threadId)
      },
      Effect.mapError(StoreError.failed("TaskStore", "get"))
    ),
    getMany: Effect.fn("TaskStore.memory.getMany")(
      function* (threadIds) {
        return yield* rows.getMany((yield* read).records.of("tasks"), threadIds)
      },
      Effect.mapError(StoreError.failed("TaskStore", "getMany"))
    ),
    listByGroup: Effect.fn("TaskStore.memory.listByGroup")(
      function* (groupId, options) {
        const before = Option.fromUndefinedOr(options.before).pipe(
          Option.map((cursor) => ({
            at: DateTime.toEpochMillis(cursor.createdAt),
            id: cursor.threadId
          }))
        )
        return (yield* rows.all((yield* read).records.of("tasks")))
          .filter(
            (task) => task.groupId === groupId && (options.status === undefined || task.status === options.status)
          )
          .map((task) => ({ task, at: DateTime.toEpochMillis(task.createdAt), id: task.threadId }))
          .filter((entry) => Option.isNone(before) || newestFirst(entry, before.value) > 0)
          .toSorted(newestFirst)
          .slice(0, options.limit)
          .map(({ task }) => task)
      },
      Effect.mapError(StoreError.failed("TaskStore", "listByGroup"))
    ),
    insert: Effect.fn("TaskStore.memory.insert")(
      function* (record) {
        const space = yield* write
        if (space.records.of("tasks").has(record.threadId))
          return yield* StoreError.rejected("TaskStore", "insert", "Thread already has a task")
        const row = yield* rows.encode(record)
        space.records.of("tasks").set(record.threadId, row)
      },
      Effect.mapError(StoreError.failed("TaskStore", "insert"))
    ),
    apply: Effect.fn("TaskStore.memory.apply")(
      function* (threadId, change) {
        const space = yield* write
        const found = yield* rows.get(space.records.of("tasks"), threadId)
        if (Option.isNone(found) || Task.valueOf(found.value, change) !== change.from)
          return yield* StoreError.rejected(
            "TaskStore",
            "apply",
            "Expected a task holding the value the change replaces"
          )
        const row = yield* rows.encode(Task.apply(found.value, change))
        space.records.of("tasks").set(threadId, row)
      },
      Effect.mapError(StoreError.failed("TaskStore", "apply"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `TaskStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`: tasks keyed by
 * their thread. It keeps what the contract leaves to storage: a second task for one thread
 * is rejected, and a change applies only to a stored task that still holds the value the change
 * replaces, so a change made against a stale value is rejected. A group's tasks list newest first,
 * then by thread ID in descending binary order. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(TaskStore, makeMemory())

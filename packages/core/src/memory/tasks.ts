import { Task, TaskStore } from "../task/index.ts";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeFailure } from "./errors.ts";
import * as Rows from "./rows.ts";
import { compareBinary } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(Task.Record));

/** Newest creation first, then thread ID in descending binary order. */
const newestFirst = (
  left: { readonly at: number; readonly id: string },
  right: { readonly at: number; readonly id: string },
) => right.at - left.at || compareBinary(right.id, left.id);

/** Tasks by thread, over one workspace's binding. @category constructors */
export const make = Effect.fn("Tasks.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: TaskStore.TaskStore["Service"] = {
    get: Effect.fn("Tasks.get")(
      function* (threadId) {
        return yield* rows.get((yield* read).records.of("tasks"), threadId);
      },
      Effect.mapError(storeFailure(TaskStore, "get")),
    ),
    getMany: Effect.fn("Tasks.getMany")(
      function* (threadIds) {
        return yield* rows.getMany((yield* read).records.of("tasks"), threadIds);
      },
      Effect.mapError(storeFailure(TaskStore, "getMany")),
    ),
    listByGroup: Effect.fn("Tasks.listByGroup")(
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
      Effect.mapError(storeFailure(TaskStore, "listByGroup")),
    ),
    insert: Effect.fn("Tasks.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(TaskStore, "insert")));
      if (space.records.of("tasks").has(record.threadId))
        return yield* new TaskStore.Conflict({
          operation: "insert",
          message: "Thread already has a task",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(TaskStore, "insert")));
      space.records.of("tasks").set(record.threadId, row);
    }),
    apply: Effect.fn("Tasks.apply")(function* (threadId, change) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(TaskStore, "apply")));
      const found = yield* rows
        .get(space.records.of("tasks"), threadId)
        .pipe(Effect.mapError(storeFailure(TaskStore, "apply")));
      if (Option.isNone(found) || Task.valueOf(found.value, change) !== change.from)
        return yield* new TaskStore.Conflict({
          operation: "apply",
          message: "Expected a task holding the value the change replaces",
        });
      const row = yield* rows
        .encode(Task.apply(found.value, change))
        .pipe(Effect.mapError(storeFailure(TaskStore, "apply")));
      space.records.of("tasks").set(threadId, row);
    }),
  };
  return TaskStore.make(workspaceId, driver);
});
/** @category layers */
export const layer = Layer.effect(TaskStore.TaskStore, make());

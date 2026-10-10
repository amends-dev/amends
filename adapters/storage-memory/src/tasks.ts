import { Group } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Task, TaskStore } from "@amends/core/task";
import { Thread } from "@amends/core/thread";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validate = Schema.decodeEffect(Schema.toType(Task.Record));
const rows = Rows.make(Schema.fromJsonString(Task.Record));

/** Newest creation first, then thread ID in descending binary order. */
const newestFirst = (
  left: { readonly at: number; readonly id: string },
  right: { readonly at: number; readonly id: string },
) => right.at - left.at || compareBinary(right.id, left.id);

/** Workspace-bound tasks projection storage, keyed by thread. @category constructors */
export const make = Effect.fn("Tasks.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  return TaskStore.Service.of({
    get: Effect.fn("Tasks.get")(
      function* (input) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* rows.get((yield* read).records.tasks, threadId);
      },
      Effect.mapError(storeFailure(TaskStore, "get")),
    ),
    getMany: Effect.fn("Tasks.getMany")(
      function* (input) {
        const threadIds = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(input);
        return yield* rows.getMany((yield* read).records.tasks, threadIds);
      },
      Effect.mapError(storeFailure(TaskStore, "getMany")),
    ),
    listByGroup: Effect.fn("Tasks.listByGroup")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(Schema.toType(Task.ListOptions))(input);
        const before = Option.fromUndefinedOr(options.before).pipe(
          Option.map((cursor) => ({
            at: DateTime.toEpochMillis(cursor.createdAt),
            id: cursor.threadId,
          })),
        );
        return (yield* rows.all((yield* read).records.tasks))
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
    insert: Effect.fn("Tasks.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(TaskStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new TaskStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(TaskStore, "insert")));
      if (space.records.tasks.has(record.threadId))
        return yield* new TaskStore.Conflict({
          operation: "insert",
          message: "Thread already has a task",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(TaskStore, "insert")));
      space.records.tasks.set(record.threadId, row);
    }),
    apply: Effect.fn("Tasks.apply")(function* (threadInput, changeInput) {
      yield* Store.Transaction;
      const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput).pipe(
        Effect.mapError(storeConflict(TaskStore, "apply")),
      );
      const change = yield* Schema.decodeEffect(Schema.toType(Task.Change))(changeInput).pipe(
        Effect.mapError(storeConflict(TaskStore, "apply")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(TaskStore, "apply")));
      const found = yield* rows
        .get(space.records.tasks, threadId)
        .pipe(Effect.mapError(storeFailure(TaskStore, "apply")));
      if (Option.isNone(found) || Task.valueOf(found.value, change) !== change.from)
        return yield* new TaskStore.Conflict({
          operation: "apply",
          message: "Expected a task holding the value the change replaces",
        });
      const row = yield* rows
        .encode(Task.apply(found.value, change))
        .pipe(Effect.mapError(storeFailure(TaskStore, "apply")));
      space.records.tasks.set(threadId, row);
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(TaskStore.Service, make());
export * as Tasks from "./tasks.ts";

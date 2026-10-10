/**
 * Keeps the task read model, `TaskStore`: a created task is inserted as its record, and each change
 * is applied to the row from the fact alone, so the rows rebuild to the same state from the journal.
 *
 * @since 0.1.0
 */
import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { TaskFacts } from "./TaskFacts.ts";
import { TaskStore } from "./TaskStore.ts";

/**
 * Inserts each created task and applies each change.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("task", { version: 1 })
  .on(
    TaskFacts.Created,
    Effect.fn("TaskProjection.created")(function* ({ payload }) {
      const taskStore = yield* TaskStore.Service;
      yield* taskStore.insert(payload);
    }),
  )
  .on(
    TaskFacts.Updated,
    Effect.fn("TaskProjection.updated")(function* ({ payload }) {
      const taskStore = yield* TaskStore.Service;
      yield* taskStore.apply(payload.threadId, payload.change);
    }),
  );

export * as TaskProjection from "./TaskProjection.ts";

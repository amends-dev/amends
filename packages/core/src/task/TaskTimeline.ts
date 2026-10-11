/**
 * How a task appears in its thread's timeline: its creation and each change, whose details carry
 * everything shown, so resolving them reads nothing.
 *
 * @since 0.1.0
 */
import { Effect, Schema } from "effect";
import type * as Thread from "../thread/Thread.ts";
import type * as ThreadActivity from "../thread/ThreadActivity.ts";
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import type * as ThreadActivityResolvers from "../thread/ThreadActivityResolvers.ts";
import * as TaskActivity from "./TaskActivity.ts";

/**
 * The thread becoming a task, with the task's initial values.
 *
 * @category schemas
 * @since 0.1.0
 */
export const CreatedItem = Schema.Struct({ activity: TaskActivity.Created.Activity });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface CreatedItem extends Schema.Schema.Type<typeof CreatedItem> {}

/**
 * One change to the task, with the value it replaced.
 *
 * @category schemas
 * @since 0.1.0
 */
export const UpdatedItem = Schema.Struct({ activity: TaskActivity.Updated.Activity });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface UpdatedItem extends Schema.Schema.Type<typeof UpdatedItem> {}

type Created = CreatedItem;

type Updated = UpdatedItem;

declare module "../thread/ThreadActivityKind.ts" {
  interface Items {
    "task.created": Created;
    "task.updated": Updated;
  }
}

/**
 * Resolve task activity from its own details.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolver = Effect.succeed({
  kinds: [TaskActivity.Created, TaskActivity.Updated],
  resolve: Effect.fn("TaskTimeline.resolve")(function* (
    _thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
  ) {
    return yield* Effect.orDie(
      Effect.forEach(
        listed,
        (
          activity,
        ): Effect.Effect<
          CreatedItem | UpdatedItem,
          ThreadActivityKind.Mismatch | Schema.SchemaError
        > =>
          ThreadActivityKind.is(TaskActivity.Created)(activity)
            ? Effect.map(
                ThreadActivityKind.decode(TaskActivity.Created, activity),
                (activity): CreatedItem => ({ activity }),
              )
            : Effect.map(
                ThreadActivityKind.decode(TaskActivity.Updated, activity),
                (activity): UpdatedItem => ({ activity }),
              ),
      ),
    );
  }),
} satisfies ThreadActivityResolvers.Resolver);

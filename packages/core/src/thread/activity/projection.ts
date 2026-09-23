import { Effect, Option, Schema } from "effect";
import { Projection } from "../../journal/projection.ts";
import { GroupStore } from "../../group/store.ts";
import { Thread } from "../thread.ts";
import { ThreadStore } from "../store.ts";
import { ThreadActivityFacts } from "./facts.ts";
import { ThreadActivityStore } from "./store.ts";

/** Records each activity, and advances its thread's and group's latest activity for messages. */
export const definition = Projection.make("thread.activity", { version: 1 }).on(
  ThreadActivityFacts.Recorded,
  Effect.fn("ThreadActivityProjection.recorded")(function* ({ payload }) {
    const store = yield* ThreadActivityStore.Service;
    const threads = yield* ThreadStore.Service;
    const groups = yield* GroupStore.Service;
    const { activity } = payload;
    if (
      [store.workspaceId, threads.workspaceId, groups.workspaceId].some(
        (id) => id !== activity.workspaceId,
      )
    )
      return yield* new ThreadActivityStore.Conflict({
        operation: "project",
        message: "Fact belongs to another workspace",
      });
    yield* store.insert(activity);
    if (activity.kind !== "MessagePublished") return;
    const found = yield* threads.get(activity.threadId);
    if (Option.isNone(found))
      return yield* new ThreadActivityStore.Conflict({
        operation: "project",
        message: "Activity thread is missing",
      });
    const thread = yield* Schema.decodeEffect(Schema.toType(Thread.Record))(found.value);
    if (thread.id !== activity.threadId || thread.workspaceId !== activity.workspaceId)
      return yield* new ThreadActivityStore.Conflict({
        operation: "project",
        message: "Thread store returned another thread or workspace",
      });
    yield* threads.recordLatest({
      threadId: thread.id,
      sequence: activity.sequence,
      occurredAt: activity.occurredAt,
    });
    yield* groups.recordLatest({ groupId: thread.groupId, occurredAt: activity.occurredAt });
  }),
);
export * as ThreadActivityProjection from "./projection.ts";

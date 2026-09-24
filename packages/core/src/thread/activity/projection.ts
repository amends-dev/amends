import { Effect } from "effect";
import { Projection } from "../../journal/projection.ts";
import { ThreadActivityFacts } from "./facts.ts";
import { ThreadActivityStore } from "./store.ts";

/** Records each activity. The thread and group read models keep their own latest activity. */
export const definition = Projection.make("thread.activity", { version: 1 }).on(
  ThreadActivityFacts.Recorded,
  Effect.fn("ThreadActivityProjection.recorded")(function* ({ payload }) {
    const store = yield* ThreadActivityStore.Service;
    if (store.workspaceId !== payload.activity.workspaceId)
      return yield* new ThreadActivityStore.Conflict({
        operation: "project",
        message: "Fact belongs to another workspace",
      });
    yield* store.insert(payload.activity);
  }),
);
export * as ThreadActivityProjection from "./projection.ts";

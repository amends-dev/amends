import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { GroupFacts } from "./facts.ts";
import { GroupStore } from "./store.ts";

export const definition = Projection.make("groups", { version: 1 })
  .on(
    GroupFacts.Created,
    Effect.fn("GroupProjection.created")(function* ({ payload }) {
      const store = yield* GroupStore.Service;
      if (store.workspaceId !== payload.workspaceId)
        return yield* new GroupStore.Conflict({
          operation: "project",
          message: "Fact belongs to another workspace",
        });
      yield* store.insert(payload);
    }),
  )
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("GroupProjection.activity")(function* ({ payload: { groupId, activity } }) {
      const store = yield* GroupStore.Service;
      if (store.workspaceId !== activity.workspaceId)
        return yield* new GroupStore.Conflict({
          operation: "project",
          message: "Fact belongs to another workspace",
        });
      // A group's latest activity is the latest message in any of its threads.
      if (activity.kind !== "MessagePublished") return;
      yield* store.recordLatest({ groupId, occurredAt: activity.occurredAt });
    }),
  );

export * as GroupProjection from "./projection.ts";

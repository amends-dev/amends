import { Effect } from "effect";
import * as Projection from "../journal/projection.ts";
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts";
import * as GroupFacts from "./facts.ts";
import * as GroupStore from "./store.ts";

export const definition = Projection.make("groups", { version: 1 })
  .on(
    GroupFacts.Created,
    Effect.fn("GroupProjection.created")(function* ({ payload }) {
      const groupStore = yield* GroupStore.GroupStore;
      yield* groupStore.insert(payload);
    }),
  )
  .on(
    GroupFacts.Renamed,
    Effect.fn("GroupProjection.renamed")(function* ({ payload }) {
      const groupStore = yield* GroupStore.GroupStore;
      yield* groupStore.rename(payload);
    }),
  )
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("GroupProjection.activity")(function* ({ payload: { groupId, activity } }) {
      const groupStore = yield* GroupStore.GroupStore;
      // A group's latest activity is the latest activity of a kind that counts as new, such as a
      // message, in any of its threads.
      if (!activity.newActivity) return;
      yield* groupStore.recordLatest({ groupId, occurredAt: activity.occurredAt });
    }),
  );

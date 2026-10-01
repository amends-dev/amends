import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { ThreadActivityFacts } from "./activity/facts.ts";
import { ThreadFacts } from "./facts.ts";
import { ThreadStore } from "./store.ts";

export const definition = Projection.make("threads", { version: 1 })
  .on(
    ThreadFacts.Created,
    Effect.fn("ThreadProjection.created")(function* ({ payload }) {
      const threadStore = yield* ThreadStore.Service;
      yield* threadStore.insert(payload);
    }),
  )
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("ThreadProjection.activity")(function* ({ payload: { activity } }) {
      const threadStore = yield* ThreadStore.Service;
      // A thread's latest activity is its latest of a kind that counts as new, such as a message.
      if (!activity.newActivity) return;
      yield* threadStore.recordLatest({
        threadId: activity.threadId,
        sequence: activity.sequence,
        occurredAt: activity.occurredAt,
      });
    }),
  );
export * as ThreadProjection from "./projection.ts";

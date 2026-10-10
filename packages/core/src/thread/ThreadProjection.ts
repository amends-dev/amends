/**
 * Keeps the thread read model, `ThreadStore`: each thread as it was created, and its latest
 * activity, by which a group's threads are listed and shown as unread.
 *
 * @since 0.1.0
 */
import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { ThreadActivityFacts } from "./ThreadActivityFacts.ts";
import { ThreadFacts } from "./ThreadFacts.ts";
import { ThreadStore } from "./ThreadStore.ts";

/**
 * Inserts each created thread, and advances a thread's latest activity on each activity of a kind
 * that counts as new, such as a message; quiet kinds leave it as it is.
 *
 * @category projections
 * @since 0.1.0
 */
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
      if (!activity.newActivity) return;
      yield* threadStore.recordLatest({
        threadId: activity.threadId,
        sequence: activity.sequence,
        occurredAt: activity.occurredAt,
      });
    }),
  );

export * as ThreadProjection from "./ThreadProjection.ts";

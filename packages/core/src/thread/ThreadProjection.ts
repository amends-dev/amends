/**
 * Keeps the thread read model, `ThreadStore`: each thread as it was created and since renamed, and
 * its latest activity, by which a group's threads are listed and shown as unread.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Projection from "../journal/Projection.ts";
import * as ThreadActivityFacts from "./ThreadActivityFacts.ts";
import * as ThreadFacts from "./ThreadFacts.ts";
import * as ThreadStore from "./ThreadStore.ts";

/**
 * Inserts each created thread, sets the title of each renamed one, and advances a thread's latest
 * activity on each activity of a kind that counts as new, such as a message; quiet kinds leave it
 * as it is.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("threads", { version: 1 })
  .on(
    ThreadFacts.Created,
    Effect.fn("ThreadProjection.created")(function* ({ payload }) {
      const threadStore = yield* ThreadStore.ThreadStore;
      yield* threadStore.insert(payload);
    }),
  )
  .on(
    ThreadFacts.Renamed,
    Effect.fn("ThreadProjection.renamed")(function* ({ payload }) {
      const threadStore = yield* ThreadStore.ThreadStore;
      yield* threadStore.rename(payload);
    }),
  )
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("ThreadProjection.activity")(function* ({ payload: { activity } }) {
      const threadStore = yield* ThreadStore.ThreadStore;
      if (!activity.newActivity) return;
      yield* threadStore.recordLatest({
        threadId: activity.threadId,
        sequence: activity.sequence,
        occurredAt: activity.occurredAt,
      });
    }),
  );

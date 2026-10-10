/**
 * Keeps the message read model, `ThreadMessageStore`: each message as it was published, and its
 * content as last edited or deleted.
 *
 * @since 0.1.0
 */
import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { ThreadMessageFacts } from "./ThreadMessageFacts.ts";
import { ThreadMessageStore } from "./ThreadMessageStore.ts";

/**
 * Inserts each published message, and replaces its content on each edit and deletion. The group
 * on the facts is for their audience, not for the row.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("thread.message", { version: 1 })
  .on(
    ThreadMessageFacts.Published,
    Effect.fn("ThreadMessageProjection.published")(function* ({
      payload: { groupId: _group, ...payload },
    }) {
      const threadMessageStore = yield* ThreadMessageStore.Service;
      yield* threadMessageStore.insert(payload);
    }),
  )
  .on(
    ThreadMessageFacts.Edited,
    Effect.fn("ThreadMessageProjection.edited")(function* ({ payload }) {
      const threadMessageStore = yield* ThreadMessageStore.Service;
      yield* threadMessageStore.edit(payload);
    }),
  )
  .on(
    ThreadMessageFacts.Deleted,
    Effect.fn("ThreadMessageProjection.deleted")(function* ({ payload }) {
      const threadMessageStore = yield* ThreadMessageStore.Service;
      yield* threadMessageStore.delete(payload);
    }),
  );

export * as ThreadMessageProjection from "./ThreadMessageProjection.ts";

/**
 * Keeps the message read model, `ThreadMessageStore`: each message as it was published, and its
 * content as last edited or deleted.
 *
 * @since 0.1.0
 */
import { Effect } from "effect";
import * as Projection from "../journal/projection.ts";
import * as ThreadMessageFacts from "./ThreadMessageFacts.ts";
import * as ThreadMessageStore from "./ThreadMessageStore.ts";

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
      const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore;
      yield* threadMessageStore.insert(payload);
    }),
  )
  .on(
    ThreadMessageFacts.Edited,
    Effect.fn("ThreadMessageProjection.edited")(function* ({ payload }) {
      const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore;
      yield* threadMessageStore.edit(payload);
    }),
  )
  .on(
    ThreadMessageFacts.Deleted,
    Effect.fn("ThreadMessageProjection.deleted")(function* ({ payload }) {
      const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore;
      yield* threadMessageStore.delete(payload);
    }),
  );

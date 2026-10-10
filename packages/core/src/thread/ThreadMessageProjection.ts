/**
 * Keeps the message read model, `ThreadMessageStore`: each message as it was published.
 *
 * @since 0.1.0
 */
import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { ThreadMessageFacts } from "./ThreadMessageFacts.ts";
import { ThreadMessageStore } from "./ThreadMessageStore.ts";

/**
 * Inserts each published message. The group on the fact is for its audience, not for the row.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("thread.message", { version: 1 }).on(
  ThreadMessageFacts.Published,
  Effect.fn("ThreadMessageProjection.published")(function* ({
    payload: { groupId: _group, ...payload },
  }) {
    const threadMessageStore = yield* ThreadMessageStore.Service;
    yield* threadMessageStore.insert(payload);
  }),
);

export * as ThreadMessageProjection from "./ThreadMessageProjection.ts";

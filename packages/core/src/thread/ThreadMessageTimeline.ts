/**
 * How messages appear in a timeline: a publication with its message, read by ID, so a page of
 * messages costs one read of the message store.
 *
 * @since 0.1.0
 */
import { Effect, Schema } from "effect";
import type { Thread } from "./Thread.ts";
import type { ThreadActivity } from "./ThreadActivity.ts";
import { ThreadActivityKind } from "./ThreadActivityKind.ts";
import { ThreadActivityResolvers } from "./ThreadActivityResolvers.ts";
import { ThreadMessageActivity } from "./ThreadMessageActivity.ts";
import { ThreadMessage } from "./ThreadMessage.ts";
import { ThreadMessageStore } from "./ThreadMessageStore.ts";

/**
 * A published message in its thread's timeline.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Item = Schema.Struct({
  activity: ThreadMessageActivity.Published.Activity,
  message: ThreadMessage.Record,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Item extends Schema.Schema.Type<typeof Item> {}

type PublishedItem = Item;

declare module "./ThreadActivityKind.ts" {
  interface Items {
    "message.published": PublishedItem;
  }
}

/**
 * Resolve message publications with one read of their messages.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolver = Effect.gen(function* () {
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const resolve = Effect.fn("ThreadMessageTimeline.resolve")(function* (
    _thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
  ) {
    const activities = yield* Effect.orDie(
      Effect.forEach(listed, (activity) =>
        ThreadActivityKind.decode(ThreadMessageActivity.Published, activity),
      ),
    );
    const rows = yield* threadMessageStore
      .getMany([...new Set(activities.map((activity) => activity.details.messageId))])
      .pipe(Effect.mapError((cause) => new ThreadActivityResolvers.Failure({ cause })));
    const found = new Map(rows.map((message) => [message.id, message] as const));
    return yield* Effect.forEach(activities, (activity) => {
      const message = found.get(activity.details.messageId);
      return message === undefined
        ? Effect.die("A timeline activity's message is missing")
        : Effect.succeed({ activity, message } satisfies Item);
    });
  });
  return {
    kinds: [ThreadMessageActivity.Published],
    resolve,
  } satisfies ThreadActivityResolvers.Resolver;
});

export * as ThreadMessageTimeline from "./ThreadMessageTimeline.ts";

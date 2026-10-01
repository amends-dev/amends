import { Effect, Schema } from "effect";
import type { Thread } from "../thread.ts";
import type { ThreadActivity } from "../activity/activity.ts";
import { ThreadActivityKind } from "../activity/kind.ts";
import { ThreadActivityResolvers } from "../activity/resolvers.ts";
import { ThreadMessageActivity } from "./activity.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessageStore } from "./store.ts";

/** A published message in its thread's timeline. */
export const Item = Schema.Struct({
  activity: ThreadMessageActivity.Published.Activity,
  message: ThreadMessage.Record,
});
export interface Item extends Schema.Schema.Type<typeof Item> {}

type PublishedItem = Item;
declare module "../activity/kind.ts" {
  interface Items {
    "message.published": PublishedItem;
  }
}

/** Resolve message publications with one read of their messages. @category constructors */
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

export * as ThreadMessageTimeline from "./timeline.ts";

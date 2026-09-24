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

const invalid = (message: string) => new ThreadActivityResolvers.InvalidResponse({ message });

/** Resolve message publications with one read of their messages. @category constructors */
export const resolver = Effect.gen(function* () {
  const messages = yield* ThreadMessageStore.Service;
  const workspaceId = messages.workspaceId;
  const resolve = Effect.fn("ThreadMessageTimeline.resolve")(function* (
    thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
  ) {
    const activities = yield* Effect.forEach(listed, (activity) =>
      ThreadActivityKind.decode(ThreadMessageActivity.Published, activity).pipe(
        Effect.mapError((cause) => invalid(`Invalid message activity: ${cause.message}`)),
      ),
    );
    const ids = new Set(activities.map((activity) => activity.details.messageId));
    const found = new Map<ThreadMessage.Id, ThreadMessage.Record>();
    const rows = yield* messages
      .getMany([...ids])
      .pipe(Effect.mapError((cause) => new ThreadActivityResolvers.Failure({ cause })));
    for (const row of rows) {
      const message = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Record))(row).pipe(
        Effect.mapError((cause) =>
          invalid(`Thread storage returned invalid data: ${cause.message}`),
        ),
      );
      if (!ids.has(message.id) || found.has(message.id))
        return yield* invalid("Message store returned another message, thread, or workspace");
      found.set(message.id, message);
    }
    return yield* Effect.forEach(activities, (activity) => {
      const message = found.get(activity.details.messageId);
      if (message === undefined)
        return Effect.fail(invalid("Timeline activity references a missing message"));
      if (message.workspaceId !== workspaceId || message.threadId !== thread.id)
        return Effect.fail(invalid("Message store returned another message, thread, or workspace"));
      return Effect.succeed({ activity, message } satisfies Item);
    });
  });
  return {
    workspaceId,
    kinds: [ThreadMessageActivity.Published],
    resolve,
  } satisfies ThreadActivityResolvers.Resolver;
});

export * as ThreadMessageTimeline from "./timeline.ts";

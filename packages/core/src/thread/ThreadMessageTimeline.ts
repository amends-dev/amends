/**
 * How messages appear in a timeline: a publication, an edit, or a deletion, each with its message
 * as it is now, read by ID, so a page of them costs one read of the message store. An edit's or
 * deletion's item carries the same current message, so a reader shows the publication with its
 * current content and collapses the rest into an edited or deleted mark.
 *
 * @since 0.1.0
 */
import { Effect, Schema } from "effect";
import type * as Thread from "./Thread.ts";
import type * as ThreadActivity from "./ThreadActivity.ts";
import * as ThreadActivityKind from "./ThreadActivityKind.ts";
import * as ThreadActivityResolvers from "./ThreadActivityResolvers.ts";
import * as ThreadMessageActivity from "./ThreadMessageActivity.ts";
import * as ThreadMessage from "./ThreadMessage.ts";
import * as ThreadMessageStore from "./ThreadMessageStore.ts";

/**
 * A published message in its thread's timeline, with its content as it is now.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PublishedItem = Schema.Struct({
  activity: ThreadMessageActivity.Published.Activity,
  message: ThreadMessage.Record,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface PublishedItem extends Schema.Schema.Type<typeof PublishedItem> {}

/**
 * An edit of a message, with the message as it is now.
 *
 * @category schemas
 * @since 0.1.0
 */
export const EditedItem = Schema.Struct({
  activity: ThreadMessageActivity.Edited.Activity,
  message: ThreadMessage.Record,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface EditedItem extends Schema.Schema.Type<typeof EditedItem> {}

/**
 * A deletion of a message, with the message as it is now.
 *
 * @category schemas
 * @since 0.1.0
 */
export const DeletedItem = Schema.Struct({
  activity: ThreadMessageActivity.Deleted.Activity,
  message: ThreadMessage.Record,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface DeletedItem extends Schema.Schema.Type<typeof DeletedItem> {}

type Published = PublishedItem;

type Edited = EditedItem;

type Deleted = DeletedItem;

declare module "./ThreadActivityKind.ts" {
  interface Items {
    "message.published": Published;
    "message.edited": Edited;
    "message.deleted": Deleted;
  }
}

const decode = (
  activity: ThreadActivity.Record,
): Effect.Effect<
  ThreadMessageActivity.Published | ThreadMessageActivity.Edited | ThreadMessageActivity.Deleted,
  ThreadActivityKind.Mismatch | Schema.SchemaError
> =>
  ThreadActivityKind.is(ThreadMessageActivity.Published)(activity)
    ? ThreadActivityKind.decode(ThreadMessageActivity.Published, activity)
    : ThreadActivityKind.is(ThreadMessageActivity.Edited)(activity)
      ? ThreadActivityKind.decode(ThreadMessageActivity.Edited, activity)
      : ThreadActivityKind.decode(ThreadMessageActivity.Deleted, activity);

/**
 * Resolve publications, edits, and deletions with one read of their messages.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolver = Effect.gen(function* () {
  const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore;
  const resolve = Effect.fn("ThreadMessageTimeline.resolve")(function* (
    _thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
  ) {
    const activities = yield* Effect.orDie(Effect.forEach(listed, (activity) => decode(activity)));
    const rows = yield* threadMessageStore
      .getMany([...new Set(activities.map((activity) => activity.details.messageId))])
      .pipe(Effect.mapError((cause) => new ThreadActivityResolvers.Failure({ cause })));
    const found = new Map(rows.map((message) => [message.id, message] as const));
    return yield* Effect.forEach(
      activities,
      (activity): Effect.Effect<PublishedItem | EditedItem | DeletedItem> => {
        const message = found.get(activity.details.messageId);
        if (message === undefined) return Effect.die("A timeline activity's message is missing");
        switch (activity.kind) {
          case ThreadMessageActivity.Published.name:
            return Effect.succeed({ activity, message } satisfies PublishedItem);
          case ThreadMessageActivity.Edited.name:
            return Effect.succeed({ activity, message } satisfies EditedItem);
          case ThreadMessageActivity.Deleted.name:
            return Effect.succeed({ activity, message } satisfies DeletedItem);
        }
      },
    );
  });
  return {
    kinds: [
      ThreadMessageActivity.Published,
      ThreadMessageActivity.Edited,
      ThreadMessageActivity.Deleted,
    ],
    resolve,
  } satisfies ThreadActivityResolvers.Resolver;
});

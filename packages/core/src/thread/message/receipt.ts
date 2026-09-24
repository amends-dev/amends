import { Effect, Option, Schema } from "effect";
import { ThreadActivity } from "../activity/activity.ts";
import { ThreadActivityKind } from "../activity/kind.ts";
import type { ThreadActivityStore } from "../activity/store.ts";
import { Thread } from "../thread.ts";
import type { ThreadStore } from "../store.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessageActivity } from "./activity.ts";
import type { ThreadMessageStore } from "./store.ts";

/** What a keyed request that published a message created, by ID: the message and its activity. */
export const Published = Schema.Struct({
  messageId: ThreadMessage.Id,
  activityId: ThreadActivity.Id,
});
export type Published = typeof Published.Type;

/** What a keyed request that started a thread created, by ID. */
export const Started = Schema.Struct({ threadId: Thread.Id, ...Published.fields });
export type Started = typeof Started.Type;

export const publishedOf = (published: ThreadMessage.Published): Published => ({
  messageId: published.message.id,
  activityId: published.activity.id,
});
export const startedOf = (started: Thread.Started): Started =>
  Object.assign({ threadId: started.thread.id }, publishedOf(started));

const decodeMessage = Schema.decodeUnknownEffect(Schema.toType(ThreadMessage.Record));
const decodeActivity = Schema.decodeUnknownEffect(Schema.toType(ThreadActivity.Record));

/**
 * Read a request's published message and activity again, or None when either is missing or they
 * no longer belong together, which the caller reports as inconsistent storage.
 */
export const restorePublished = Effect.fnUntraced(function* (
  stores: {
    readonly messages: ThreadMessageStore.Interface;
    readonly activities: ThreadActivityStore.Interface;
  },
  reference: Published,
) {
  const message = yield* stores.messages.get(reference.messageId);
  const activity = yield* stores.activities.get(reference.activityId);
  if (Option.isNone(message) || Option.isNone(activity))
    return Option.none<ThreadMessage.Published>();
  const typed = yield* ThreadActivityKind.decode(
    ThreadMessageActivity.Published,
    yield* decodeActivity(activity.value),
  ).pipe(Effect.option);
  if (Option.isNone(typed)) return Option.none<ThreadMessage.Published>();
  const published = { message: yield* decodeMessage(message.value), activity: typed.value };
  return published.activity.details.messageId === published.message.id &&
    published.activity.threadId === published.message.threadId
    ? Option.some(published)
    : Option.none<ThreadMessage.Published>();
});

/** Read a request's started thread, opening message, and activity again, or None. */
export const restoreStarted = Effect.fnUntraced(function* (
  stores: {
    readonly threads: ThreadStore.Interface;
    readonly messages: ThreadMessageStore.Interface;
    readonly activities: ThreadActivityStore.Interface;
  },
  reference: Started,
) {
  const thread = yield* stores.threads.get(reference.threadId);
  const published = yield* restorePublished(stores, reference);
  if (Option.isNone(thread) || Option.isNone(published)) return Option.none<Thread.Started>();
  const record = yield* Schema.decodeEffect(Schema.toType(Thread.Record))(thread.value);
  return published.value.message.threadId === record.id
    ? Option.some(Object.assign({ thread: record }, published.value))
    : Option.none<Thread.Started>();
});

export * as ThreadMessageReceipt from "./receipt.ts";

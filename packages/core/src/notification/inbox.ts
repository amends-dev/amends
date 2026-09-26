import { Schema } from "effect";
import { ThreadTimeline } from "../thread/timeline.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";

/** One page of a reader's inbox, newest first: all of it, or what still waits for them. */
export const Options = Schema.Struct({
  ...NotificationStore.LatestOptions.fields,
  pendingOnly: Schema.optionalKey(Schema.Boolean),
});
export interface Options extends Schema.Schema.Type<typeof Options> {}

/**
 * A notification in its recipient's inbox, with the activity it points to while the recipient can
 * still read it. Access is current, as when resolving one source: someone who left the group keeps
 * the notification without its activity.
 */
export const Item = Schema.Struct({
  notification: Notification.Record,
  source: Schema.optionalKey(ThreadTimeline.Item),
});
export interface Item extends Schema.Schema.Type<typeof Item> {}

export * as NotificationInbox from "./inbox.ts";

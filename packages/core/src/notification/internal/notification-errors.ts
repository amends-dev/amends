/**
 * The outcomes `NotificationService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's error types add the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Notification from "../Notification.ts";

/**
 * The notification no longer waits for its recipient: it was discarded, or settled some other way,
 * so it cannot be marked seen.
 */
export class AlreadyHandled extends Schema.TaggedError<AlreadyHandled>()(
  "NotificationService.AlreadyHandled",
  { notificationId: Notification.Id },
) {}

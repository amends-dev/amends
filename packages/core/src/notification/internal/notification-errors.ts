/**
 * The outcomes `NotificationService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's error types add the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as WorkspaceId from "../../workspace/WorkspaceId.ts";
import * as Notification from "../Notification.ts";

/**
 * The notification no longer waits for its recipient: it was discarded, or settled some other way,
 * so it cannot be marked seen.
 */
export class AlreadyHandled extends Schema.TaggedError<AlreadyHandled>()(
  "NotificationService.AlreadyHandled",
  { notificationId: Notification.Id },
) {}

/**
 * The acting member is not a person: only people mark their notifications seen.
 */
export class HumanRecipientRequired extends Schema.TaggedError<HumanRecipientRequired>()(
  "NotificationService.HumanRecipientRequired",
  {},
) {}

/**
 * The notification is missing, or is another recipient's; the two are deliberately not told
 * apart.
 */
export class NotFound extends Schema.TaggedError<NotFound>()("NotificationService.NotFound", {
  workspaceId: WorkspaceId.Id,
  notificationId: Notification.Id,
}) {}

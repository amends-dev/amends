import { Schema } from "effect";
import { WorkspaceId } from "../workspace/id.ts";
import { Notification } from "./notification.ts";

/** The outcomes `NotificationService` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyHandled extends Schema.TaggedError<AlreadyHandled>()(
  "NotificationService.AlreadyHandled",
  { notificationId: Notification.Id },
) {}
export class HumanRecipientRequired extends Schema.TaggedError<HumanRecipientRequired>()(
  "NotificationService.HumanRecipientRequired",
  {},
) {}
/** Missing and other recipients' notifications deliberately share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("NotificationService.NotFound", {
  workspaceId: WorkspaceId.Id,
  notificationId: Notification.Id,
}) {}
/** The caller owns the notification, but its supported source cannot currently be read. */
export class SourceUnavailable extends Schema.TaggedError<SourceUnavailable>()(
  "NotificationService.SourceUnavailable",
  { notificationId: Notification.Id },
) {}

export * as NotificationErrors from "./errors.ts";

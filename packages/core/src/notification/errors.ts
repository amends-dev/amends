import { Schema } from "effect";
import { WorkspaceId } from "../workspace/id.ts";
import { Notification } from "./notification.ts";

/** The outcomes `NotificationApplication` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyHandled extends Schema.TaggedError<AlreadyHandled>()(
  "NotificationApplication.AlreadyHandled",
  { notificationId: Notification.Id },
) {}
export class HumanRecipientRequired extends Schema.TaggedError<HumanRecipientRequired>()(
  "NotificationApplication.HumanRecipientRequired",
  {},
) {}
/** Missing and other recipients' notifications deliberately share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("NotificationApplication.NotFound", {
  workspaceId: WorkspaceId.Id,
  notificationId: Notification.Id,
}) {}
/** The caller owns the notification, but its supported source cannot currently be read. */
export class SourceUnavailable extends Schema.TaggedError<SourceUnavailable>()(
  "NotificationApplication.SourceUnavailable",
  { notificationId: Notification.Id },
) {}

export * as NotificationErrors from "./errors.ts";

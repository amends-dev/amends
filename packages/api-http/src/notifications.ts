import { Notification, NotificationInbox, NotificationStore } from "@amends/core/notification";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const record = Notification.Record.annotate({ identifier: "Notification" });

const params = { workspaceId: Workspace.Id, notificationId: Notification.Id };
const cursor = Schema.fromJsonString(NotificationStore.Cursor);

/**
 * The authenticated member's inbox within one workspace: reading it newest first, with each
 * notification's source while they may read it, counting what is pending, and marking
 * notifications seen. Reading neither
 * marks a notification seen nor grants access to its source.
 */
export class NotificationsGroup extends HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("inbox", "/inbox", {
      params: { workspaceId: Workspace.Id },
      query: {
        limit: NotificationStore.LatestOptions.fields.limit.check(Schema.isLessThanOrEqualTo(50)),
        before: Schema.optionalKey(cursor).annotate({
          description: "Exclusive boundary as JSON containing recordedAt (UTC ISO string) and id.",
        }),
        pendingOnly: Schema.optionalKey(Schema.Boolean),
      },
      success: Schema.Array(NotificationInbox.Item.annotate({ identifier: "InboxItem" })),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.get("count", "/count", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Struct({ pending: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.post("markSeenThrough", "/seen", {
      params: { workspaceId: Workspace.Id },
      payload: Schema.Struct({ through: NotificationStore.Cursor }),
      success: Schema.Struct({ marked: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      error: [...ApiErrors.member, ApiErrors.NotificationHumanRecipientRequired],
    }),
    HttpApiEndpoint.post("markSeen", "/:notificationId/seen", {
      params,
      success: record,
      error: [
        ...ApiErrors.member,
        ApiErrors.NotificationNotFound,
        ApiErrors.NotificationHumanRecipientRequired,
        ApiErrors.NotificationAlreadyHandled,
      ],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/notifications") {}

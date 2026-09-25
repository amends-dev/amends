import { Notification, NotificationStore } from "@amends/core/notification";
import { ThreadTimeline } from "@amends/core/thread";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const record = Notification.Record.annotate({ identifier: "Notification" });

const params = { workspaceId: Workspace.Id, notificationId: Notification.Id };

/**
 * The authenticated recipient's inbox within one workspace: reading it, opening what a
 * notification points to, and acknowledging it. Reading neither acknowledges a notification nor
 * grants access to its source.
 */
export class NotificationsGroup extends HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      query: {
        limit: NotificationStore.ReadOptions.fields.limit.check(Schema.isLessThanOrEqualTo(100)),
        after: Schema.optionalKey(Schema.fromJsonString(NotificationStore.Cursor)).annotate({
          description: "Exclusive boundary as JSON containing recordedAt (UTC ISO string) and id.",
        }),
        pendingOnly: Schema.optionalKey(Schema.Boolean),
      },
      success: Schema.Array(record),
      error: [...ApiErrors.member, ApiErrors.NotificationNotFound],
    }),
    HttpApiEndpoint.get("get", "/:notificationId", {
      params,
      success: record,
      error: [...ApiErrors.member, ApiErrors.NotificationNotFound],
    }),
    HttpApiEndpoint.get("source", "/:notificationId/source", {
      params,
      success: ThreadTimeline.Item.annotate({ identifier: "TimelineItem" }),
      error: [
        ...ApiErrors.member,
        ApiErrors.NotificationNotFound,
        ApiErrors.NotificationSourceUnavailable,
      ],
    }),
    HttpApiEndpoint.post("acknowledge", "/:notificationId/acknowledge", {
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

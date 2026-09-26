import { Notification, NotificationInbox, NotificationStore } from "@amends/core/notification";
import { ThreadTimeline } from "@amends/core/thread";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const record = Notification.Record.annotate({ identifier: "Notification" });

const params = { workspaceId: Workspace.Id, notificationId: Notification.Id };
const cursor = Schema.fromJsonString(NotificationStore.Cursor);

/**
 * The authenticated recipient's inbox within one workspace: reading it, oldest first or newest
 * first with each notification's source, opening what a notification points to, and acknowledging
 * it. Reading neither acknowledges a notification nor grants access to its source.
 */
export class NotificationsGroup extends HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      query: {
        limit: NotificationStore.ReadOptions.fields.limit.check(Schema.isLessThanOrEqualTo(100)),
        after: Schema.optionalKey(cursor).annotate({
          description: "Exclusive boundary as JSON containing recordedAt (UTC ISO string) and id.",
        }),
        pendingOnly: Schema.optionalKey(Schema.Boolean),
      },
      success: Schema.Array(record),
      error: [...ApiErrors.member, ApiErrors.NotificationNotFound],
    }),
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
    HttpApiEndpoint.post("acknowledgeThrough", "/acknowledge", {
      params: { workspaceId: Workspace.Id },
      payload: Schema.Struct({ through: NotificationStore.Cursor }),
      success: Schema.Struct({ acknowledged: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      error: [...ApiErrors.member, ApiErrors.NotificationHumanRecipientRequired],
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

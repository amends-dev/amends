/**
 * The `notifications` endpoint group: the caller's own inbox in a workspace. Its endpoints call
 * `NotificationService`: `inbox`, `countPending`, `markSeenThrough`, and `markSeen`. Any active
 * member, person or agent, reads their own inbox and its count, and no caller selects another
 * recipient; only a person marks notifications seen. `NotificationsHandlers` implements it.
 *
 * @since 0.1.0
 */
import { Notification, NotificationInbox, NotificationStore } from "@amends-dev/core/notification";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import { WorkspaceMember } from "./WorkspaceMember.ts";
import * as ApiErrors from "./ApiErrors.ts";

const record = Notification.Notification.annotate({ identifier: "Notification" });

const params = { notificationId: Notification.Id };
const cursor = Schema.fromJsonString(NotificationStore.Cursor);

/**
 * The authenticated member's inbox within one workspace: reading it newest first, with each
 * notification's source while they may read it, counting what is pending, and marking
 * notifications seen. Reading neither
 * marks a notification seen nor grants access to its source.
 *
 * @category models
 * @since 0.1.0
 */
export class NotificationsGroup extends HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("inbox", "/inbox", {
      query: {
        limit: NotificationStore.LatestOptions.fields.limit.check(Schema.isLessThanOrEqualTo(50)),
        before: Schema.optionalKey(cursor).annotate({
          description: "Exclusive boundary as JSON containing recordedAt (UTC ISO string) and id.",
        }),
        pendingOnly: Schema.optionalKey(Schema.Boolean),
      },
      success: Schema.Array(NotificationInbox.Item.annotate({ identifier: "InboxItem" })),
      error: ApiErrors.workspace,
    }),
    HttpApiEndpoint.get("count", "/count", {
      success: Schema.Struct({ pending: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      error: ApiErrors.workspace,
    }),
    HttpApiEndpoint.post("markSeenThrough", "/seen", {
      payload: Schema.Struct({ through: NotificationStore.Cursor }),
      success: Schema.Struct({ marked: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      error: [...ApiErrors.workspace],
    }),
    HttpApiEndpoint.post("markSeen", "/:notificationId/seen", {
      params,
      success: record,
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Conflict],
    }),
  )
  .middleware(WorkspaceMember)
  .middleware(Authentication)
  .prefix("/notifications") {}

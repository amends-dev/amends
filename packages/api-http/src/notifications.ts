import { Notification, NotificationStore } from "@amends/core/notification";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const record = Notification.Record.annotate({ identifier: "Notification" });

/** Reads of the authenticated recipient's inbox within one workspace. */
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
      params: { workspaceId: Workspace.Id, notificationId: Notification.Id },
      success: record,
      error: [...ApiErrors.member, ApiErrors.NotificationNotFound],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/notifications") {}

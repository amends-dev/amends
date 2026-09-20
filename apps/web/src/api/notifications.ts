import type { Notification } from "@amends/core/notification";
import type { Workspace } from "@amends/core/workspace";
import { ApiClient } from "./client.ts";
import { keys } from "./keys.ts";

export type ListOptions = Parameters<ApiClient["Service"]["notifications"]["list"]>[0]["query"];

/** Each page is a separate query in the current credential session's registry. */
export const list = (workspaceId: Workspace.Id, options: ListOptions) =>
  ApiClient.query("notifications", "list", {
    params: { workspaceId },
    query: {
      limit: options.limit,
      pendingOnly: options.pendingOnly ?? false,
      ...(options.after === undefined
        ? {}
        : { after: { recordedAt: options.after.recordedAt, id: options.after.id } }),
    },
    reactivityKeys: [
      keys.workspace(workspaceId),
      keys.notifications.all(workspaceId),
      keys.notifications.list(workspaceId),
    ],
  });

export const get = (workspaceId: Workspace.Id, notificationId: Notification.Id) =>
  ApiClient.query("notifications", "get", {
    params: { workspaceId, notificationId },
    reactivityKeys: [
      keys.workspace(workspaceId),
      keys.notifications.all(workspaceId),
      keys.notifications.get(workspaceId, notificationId),
    ],
  });

export * as Notifications from "./notifications.ts";

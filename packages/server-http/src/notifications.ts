import { Api, Principal } from "@amends/api-http";
import { NotificationApplication } from "@amends/core/notification";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register inbox reads, with or without sources, source resolution, and acknowledgment, resolving the principal and
 * workspace membership per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "notifications",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      list: ({ params, query: { pendingOnly, ...options } }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationApplication.Service, (notifications) =>
              pendingOnly ? notifications.listPending(options) : notifications.list(options),
            ),
          ),
        ),
      inbox: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationApplication.Service, (notifications) =>
              notifications.inbox(query),
            ),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationApplication.Service, (notifications) =>
              notifications.get(params.notificationId),
            ),
          ),
        ),
      source: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationApplication.Service, (notifications) =>
              notifications.resolveSource(params.notificationId),
            ),
          ),
        ),
      acknowledge: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationApplication.Service, (notifications) =>
              notifications.acknowledge(params.notificationId),
            ),
          ),
        ),
    });
  }),
);

export * as NotificationsHandlers from "./notifications.ts";

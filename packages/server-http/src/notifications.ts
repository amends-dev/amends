import { Api, Principal } from "@amends/api-http";
import { NotificationService } from "@amends/core/notification";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register the inbox, its pending count, and marking notifications seen, resolving the
 * principal and workspace membership per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "notifications",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      inbox: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              notificationService.inbox(query),
            ),
          ),
        ),
      count: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              Effect.map(notificationService.countPending, (pending) => ({ pending })),
            ),
          ),
        ),
      markSeenThrough: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              Effect.map(notificationService.markSeenThrough(payload.through), (marked) => ({
                marked,
              })),
            ),
          ),
        ),
      markSeen: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              notificationService.markSeen(params.notificationId),
            ),
          ),
        ),
    });
  }),
);

export * as NotificationsHandlers from "./notifications.ts";

import { Api, Principal } from "@amends-dev/api-http";
import { NotificationService } from "@amends-dev/core/notification";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

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
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      inbox: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
              notificationService.inbox(query),
            ),
          ),
        ),
      count: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
              Effect.map(notificationService.countPending, (pending) => ({ pending })),
            ),
          ),
        ),
      markSeenThrough: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
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
            Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
              notificationService.markSeen(params.notificationId),
            ),
          ),
        ),
    });
  }),
);

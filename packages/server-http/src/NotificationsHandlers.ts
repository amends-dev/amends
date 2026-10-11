/**
 * Implements `NotificationsGroup`. Each handler enters the workspace as the principal's membership
 * through `Gateway.asMember` and calls one `NotificationService` operation, wrapping the pending
 * count and the number marked seen in the bodies the contract declares. `Routes` composes its
 * `layer` with the other groups'.
 *
 * @since 0.1.0
 */
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
 * @since 0.1.0
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

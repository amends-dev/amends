/**
 * Implements `NotificationsGroup`. Each handler runs in the workspace `WorkspaceMember` entered as
 * the principal's membership, and calls one `NotificationService` operation, wrapping the pending
 * count and the number marked seen in the bodies the contract declares. `Routes` composes its
 * `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { NotificationService } from "@amends-dev/core/notification";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the inbox, its pending count, and marking notifications seen, resolving the
 * principal and workspace membership per request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "notifications", (handlers) =>
  handlers.handleAll({
    inbox: ({ query }) =>
      NotificationService.NotificationService.use((notificationService) =>
        notificationService.inbox(query),
      ),
    count: () =>
      NotificationService.NotificationService.use((notificationService) =>
        Effect.map(notificationService.countPending, (pending) => ({ pending })),
      ),
    markSeenThrough: ({ payload }) =>
      NotificationService.NotificationService.use((notificationService) =>
        Effect.map(notificationService.markSeenThrough(payload.through), (marked) => ({
          marked,
        })),
      ),
    markSeen: ({ params }) =>
      NotificationService.NotificationService.use((notificationService) =>
        notificationService.markSeen(params.notificationId),
      ),
  }),
);

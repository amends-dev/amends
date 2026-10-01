import { Api, Principal } from "@amends/api-http";
import { NotificationService } from "@amends/core/notification";
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
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              pendingOnly
                ? notificationService.listPending(options)
                : notificationService.list(options),
            ),
          ),
        ),
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
      acknowledgeThrough: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              Effect.map(
                notificationService.acknowledgeThrough(payload.through),
                (acknowledged) => ({
                  acknowledged,
                }),
              ),
            ),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              notificationService.get(params.notificationId),
            ),
          ),
        ),
      source: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              notificationService.resolveSource(params.notificationId),
            ),
          ),
        ),
      acknowledge: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(NotificationService.Service, (notificationService) =>
              notificationService.acknowledge(params.notificationId),
            ),
          ),
        ),
    });
  }),
);

export * as NotificationsHandlers from "./notifications.ts";

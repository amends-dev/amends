import { Api, Principal } from "@amends/api-http";
import { ReadStateApplication } from "@amends/core/attention";
import {
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipationApplication,
} from "@amends/core/thread";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register thread handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "threads",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      list: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threadApplication) =>
              threadApplication.listInGroup(params.groupId, query),
            ),
          ),
        ),
      openings: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threadApplication) =>
              threadApplication.listOpenings(params.groupId, query),
            ),
          ),
        ),
      start: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threadApplication) =>
              threadApplication.startInGroup(
                { groupId: params.groupId, ...payload },
                { requestKey: headers["idempotency-key"] },
              ),
            ),
          ),
        ),
      startDirect: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threadApplication) =>
              threadApplication.startDirect(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threadApplication) =>
              threadApplication.get(params.threadId),
            ),
          ),
        ),
      timeline: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threadApplication) =>
              threadApplication.readTimeline(params.threadId, query),
            ),
          ),
        ),
      participants: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threadApplication) =>
              threadApplication.listParticipants(params.threadId, query),
            ),
          ),
        ),
      publish: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageApplication.Service, (threadMessageApplication) =>
              threadMessageApplication.publish(
                { threadId: params.threadId, ...payload },
                { requestKey: headers["idempotency-key"] },
              ),
            ),
          ),
        ),
      follow: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              ThreadParticipationApplication.Service,
              (threadParticipationApplication) =>
                threadParticipationApplication.follow(params.threadId),
            ),
          ),
        ),
      unfollow: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              ThreadParticipationApplication.Service,
              (threadParticipationApplication) =>
                threadParticipationApplication.unfollow({
                  threadId: params.threadId,
                  participationId: payload.participationId,
                }),
            ),
          ),
        ),
      markRead: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ReadStateApplication.Service, (readStateApplication) =>
              readStateApplication.markThreadRead({
                threadId: params.threadId,
                throughSequence: payload.throughSequence,
              }),
            ),
          ),
        ),
    });
  }),
);

export * as ThreadsHandlers from "./threads.ts";

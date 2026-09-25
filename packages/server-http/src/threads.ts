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
            Effect.flatMap(ThreadApplication.Service, (threads) =>
              threads.listInGroup(params.groupId, query),
            ),
          ),
        ),
      start: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threads) =>
              threads.startInGroup(
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
            Effect.flatMap(ThreadApplication.Service, (threads) =>
              threads.startDirect(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threads) => threads.get(params.threadId)),
          ),
        ),
      timeline: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threads) =>
              threads.readTimeline(params.threadId, query),
            ),
          ),
        ),
      participants: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadApplication.Service, (threads) =>
              threads.listParticipants(params.threadId, query),
            ),
          ),
        ),
      publish: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageApplication.Service, (messages) =>
              messages.publish(
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
            Effect.flatMap(ThreadParticipationApplication.Service, (participation) =>
              participation.follow(params.threadId),
            ),
          ),
        ),
      unfollow: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadParticipationApplication.Service, (participation) =>
              participation.unfollow({
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
            Effect.flatMap(ReadStateApplication.Service, (readState) =>
              readState.markThreadRead({
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

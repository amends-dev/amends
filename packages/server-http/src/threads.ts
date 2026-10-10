import { Api, Principal } from "@amends/api-http";
import { ReadStateService } from "@amends/core/read-state";
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends/core/thread";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

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
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.listInGroup(params.groupId, query),
            ),
          ),
        ),
      openings: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.listOpenings(params.groupId, query),
            ),
          ),
        ),
      start: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.startInGroup(
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
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.startDirect(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.get(params.threadId),
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.rename({
                threadId: params.threadId,
                title: payload.title,
                expectedTitle: payload.expectedTitle,
              }),
            ),
          ),
        ),
      timeline: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.readTimeline(params.threadId, query),
            ),
          ),
        ),
      participants: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.listParticipants(params.threadId, query),
            ),
          ),
        ),
      publish: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
              threadMessageService.publish(
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
            Effect.flatMap(ThreadParticipationService.Service, (threadParticipationService) =>
              threadParticipationService.follow(params.threadId),
            ),
          ),
        ),
      unfollow: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadParticipationService.Service, (threadParticipationService) =>
              threadParticipationService.unfollow({
                threadId: params.threadId,
                participationId: payload.participationId,
              }),
            ),
          ),
        ),
      typing: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
              threadMessageService.typing(params.threadId),
            ),
          ),
        ),
      markRead: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ReadStateService.Service, (readStateService) =>
              readStateService.markThreadRead({
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

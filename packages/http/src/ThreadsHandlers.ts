/**
 * Implements `ThreadsGroup`. Each handler enters the workspace as the principal's membership
 * through `Gateway.asMember` and calls one core operation: `ThreadService` for listing, starting,
 * reading, and renaming threads, `ThreadMessageService` for replying, editing, deleting, and
 * typing, `ThreadParticipationService` for following, and `ReadStateService.markThreadRead`. It
 * merges the path's IDs, the body, and the `Idempotency-Key` header into the operation's input.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import * as Authentication from "./Authentication.ts";
import { ReadStateService } from "@amends-dev/core/read-state";
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends-dev/core/thread";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register thread handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "threads",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      list: ({ params, query }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.listInGroup(params.groupId, query),
            ),
          ),
        ),
      openings: ({ params, query }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.listOpenings(params.groupId, query),
            ),
          ),
        ),
      start: ({ params, headers, payload }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startInGroup(
                { groupId: params.groupId, ...payload },
                { requestKey: headers["idempotency-key"] },
              ),
            ),
          ),
        ),
      startDirect: ({ params, headers, payload }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startDirect(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.get(params.threadId),
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.rename({
                threadId: params.threadId,
                title: payload.title,
                expectedTitle: payload.expectedTitle,
              }),
            ),
          ),
        ),
      timeline: ({ params, query }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.readTimeline(params.threadId, query),
            ),
          ),
        ),
      participants: ({ params, query }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.listParticipants(params.threadId, query),
            ),
          ),
        ),
      publish: ({ params, headers, payload }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish(
                { threadId: params.threadId, ...payload },
                { requestKey: headers["idempotency-key"] },
              ),
            ),
          ),
        ),
      edit: ({ params, payload }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.edit({ messageId: params.messageId, ...payload }),
            ),
          ),
        ),
      delete: ({ params }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.delete(params.messageId),
            ),
          ),
        ),
      follow: ({ params }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              ThreadParticipationService.ThreadParticipationService,
              (threadParticipationService) => threadParticipationService.follow(params.threadId),
            ),
          ),
        ),
      unfollow: ({ params, payload }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              ThreadParticipationService.ThreadParticipationService,
              (threadParticipationService) =>
                threadParticipationService.unfollow({
                  threadId: params.threadId,
                  participationId: payload.participationId,
                }),
            ),
          ),
        ),
      typing: ({ params }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.typing(params.threadId),
            ),
          ),
        ),
      markRead: ({ params, payload }) =>
        Effect.flatMap(Authentication.Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ReadStateService.ReadStateService, (readStateService) =>
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

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
import { makeAsMember } from "./internal/as-member.ts";
import { ReadStateService } from "@amends-dev/core/read-state";
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends-dev/core/thread";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register thread handlers, each entering the workspace as the request's principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "threads",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      list: ({ params, query }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) =>
            threadService.listInGroup(params.groupId, query),
          ),
        ),
      openings: ({ params, query }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) =>
            threadService.listOpenings(params.groupId, query),
          ),
        ),
      start: ({ params, headers, payload }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) =>
            threadService.startInGroup(
              { groupId: params.groupId, ...payload },
              { requestKey: headers["idempotency-key"] },
            ),
          ),
        ),
      startDirect: ({ params, headers, payload }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) =>
            threadService.startDirect(payload, { requestKey: headers["idempotency-key"] }),
          ),
        ),
      get: ({ params }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) => threadService.get(params.threadId)),
        ),
      rename: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) =>
            threadService.rename({
              threadId: params.threadId,
              title: payload.title,
              expectedTitle: payload.expectedTitle,
            }),
          ),
        ),
      timeline: ({ params, query }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) =>
            threadService.readTimeline(params.threadId, query),
          ),
        ),
      participants: ({ params, query }) =>
        asMember(
          params.workspaceId,
          ThreadService.ThreadService.use((threadService) =>
            threadService.listParticipants(params.threadId, query),
          ),
        ),
      publish: ({ params, headers, payload }) =>
        asMember(
          params.workspaceId,
          ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
            threadMessageService.publish(
              { threadId: params.threadId, ...payload },
              { requestKey: headers["idempotency-key"] },
            ),
          ),
        ),
      edit: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
            threadMessageService.edit({ messageId: params.messageId, ...payload }),
          ),
        ),
      delete: ({ params }) =>
        asMember(
          params.workspaceId,
          ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
            threadMessageService.delete(params.messageId),
          ),
        ),
      follow: ({ params }) =>
        asMember(
          params.workspaceId,
          ThreadParticipationService.ThreadParticipationService.use((threadParticipationService) =>
            threadParticipationService.follow(params.threadId),
          ),
        ),
      unfollow: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ThreadParticipationService.ThreadParticipationService.use((threadParticipationService) =>
            threadParticipationService.unfollow({
              threadId: params.threadId,
              participationId: payload.participationId,
            }),
          ),
        ),
      typing: ({ params }) =>
        asMember(
          params.workspaceId,
          ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
            threadMessageService.typing(params.threadId),
          ),
        ),
      markRead: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ReadStateService.ReadStateService.use((readStateService) =>
            readStateService.markThreadRead({
              threadId: params.threadId,
              throughSequence: payload.throughSequence,
            }),
          ),
        ),
    });
  }),
);

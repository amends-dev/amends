/**
 * Implements `ThreadsGroup`. Each handler runs in the workspace `WorkspaceMember` entered as the
 * principal's membership, and calls one core operation: `ThreadService` for listing, starting,
 * reading, and renaming threads, `ThreadMessageService` for replying, editing, deleting, and
 * typing, `ThreadParticipationService` for following, and `ReadStateService.markThreadRead`. It
 * merges the path's IDs, the body, and the `Idempotency-Key` header into the operation's input.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { ReadStateService } from "@amends-dev/core/read-state";
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends-dev/core/thread";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

/**
 * Register thread handlers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "threads", (handlers) =>
  handlers.handleAll({
    list: ({ params, query }) =>
      ThreadService.ThreadService.use((threadService) =>
        threadService.listInGroup(params.groupId, query),
      ),
    openings: ({ params, query }) =>
      ThreadService.ThreadService.use((threadService) =>
        threadService.listOpenings(params.groupId, query),
      ),
    start: ({ params, headers, payload }) =>
      ThreadService.ThreadService.use((threadService) =>
        threadService.startInGroup(
          { groupId: params.groupId, ...payload },
          { requestKey: headers["idempotency-key"] },
        ),
      ),
    startDirect: ({ headers, payload }) =>
      ThreadService.ThreadService.use((threadService) =>
        threadService.startDirect(payload, { requestKey: headers["idempotency-key"] }),
      ),
    get: ({ params }) =>
      ThreadService.ThreadService.use((threadService) => threadService.get(params.threadId)),
    rename: ({ params, payload }) =>
      ThreadService.ThreadService.use((threadService) =>
        threadService.rename({
          threadId: params.threadId,
          title: payload.title,
          expectedTitle: payload.expectedTitle,
        }),
      ),
    timeline: ({ params, query }) =>
      ThreadService.ThreadService.use((threadService) =>
        threadService.readTimeline(params.threadId, query),
      ),
    participants: ({ params, query }) =>
      ThreadService.ThreadService.use((threadService) =>
        threadService.listParticipants(params.threadId, query),
      ),
    publish: ({ params, headers, payload }) =>
      ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
        threadMessageService.publish(
          { threadId: params.threadId, ...payload },
          { requestKey: headers["idempotency-key"] },
        ),
      ),
    edit: ({ params, payload }) =>
      ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
        threadMessageService.edit({ messageId: params.messageId, ...payload }),
      ),
    delete: ({ params }) =>
      ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
        threadMessageService.delete(params.messageId),
      ),
    follow: ({ params }) =>
      ThreadParticipationService.ThreadParticipationService.use((threadParticipationService) =>
        threadParticipationService.follow(params.threadId),
      ),
    unfollow: ({ params, payload }) =>
      ThreadParticipationService.ThreadParticipationService.use((threadParticipationService) =>
        threadParticipationService.unfollow({
          threadId: params.threadId,
          participationId: payload.participationId,
        }),
      ),
    typing: ({ params }) =>
      ThreadMessageService.ThreadMessageService.use((threadMessageService) =>
        threadMessageService.typing(params.threadId),
      ),
    markRead: ({ params, payload }) =>
      ReadStateService.ReadStateService.use((readStateService) =>
        readStateService.markThreadRead({
          threadId: params.threadId,
          throughSequence: payload.throughSequence,
        }),
      ),
  }),
);

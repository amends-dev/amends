/**
 * What a member's browser and the server exchange about threads. `Actions` are what the member does
 * in a thread, which their browser applies at once and the server runs as `ThreadService`,
 * `ThreadMessageService`, `ThreadParticipationService`, and `ReadStateService` operations.
 * `Changes` keep the threads, timelines, messages, participants, and read positions in their replica
 * current.
 *
 * @since 0.1.0
 */

import { ReadState } from "@amends-dev/core/read-state"
import {
  Thread,
  ThreadActivity,
  ThreadId,
  ThreadMessage,
  ThreadMessageId,
  ThreadParticipation,
  ThreadParticipationId
} from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

/**
 * What a member does in threads. Each action's primary key is what it acts on: the thread or
 * message it changes, or the group a new thread starts in.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  // Start a thread in a group with its first message: `ThreadService.startInGroup`.
  .add({ tag: "ThreadStarted", primaryKey: ({ groupId }) => groupId, payload: Thread.StartInGroupInput })
  // Start a thread with other members directly: `ThreadService.startDirect`.
  .add({
    tag: "DirectThreadStarted",
    primaryKey: ({ memberIds }) => [...memberIds].sort().join(","),
    payload: Thread.StartDirectInput
  })
  .add({ tag: "ThreadRenamed", primaryKey: ({ threadId }) => threadId, payload: Thread.RenameInput })
  // Reply in a thread: `ThreadMessageService.publish`.
  .add({ tag: "ThreadMessagePosted", primaryKey: ({ threadId }) => threadId, payload: ThreadMessage.PublishInput })
  .add({ tag: "ThreadMessageEdited", primaryKey: ({ messageId }) => messageId, payload: ThreadMessage.EditInput })
  .add({
    tag: "ThreadMessageDeleted",
    primaryKey: ({ messageId }) => messageId,
    payload: Schema.Struct({ messageId: ThreadMessageId.ThreadMessageId })
  })
  // Take part in a thread, or stop: `ThreadParticipationService.follow` and `unfollow`.
  .add({
    tag: "ThreadFollowed",
    primaryKey: ({ threadId }) => threadId,
    payload: Schema.Struct({ threadId: ThreadId.ThreadId })
  })
  .add({
    tag: "ThreadUnfollowed",
    primaryKey: ({ threadId }) => threadId,
    payload: ThreadParticipation.UnfollowInput
  })
  // Read a thread through a position: `ReadStateService.markThreadRead`.
  .add({ tag: "ThreadMarkedRead", primaryKey: ({ threadId }) => threadId, payload: ReadState.MarkThreadReadInput })

/**
 * The thread records a replica holds: threads, the activities of their timelines, messages,
 * participants, and the member's own read positions.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges("Thread", Thread.Thread, Schema.Struct({ id: ThreadId.ThreadId }), ({ id }) => ({ id })),
  recordChanges(
    "ThreadActivity",
    ThreadActivity.ThreadActivity,
    Schema.Struct({ id: ThreadActivity.ThreadActivityId }),
    ({ id }) => ({ id })
  ),
  recordChanges(
    "ThreadMessage",
    ThreadMessage.ThreadMessage,
    Schema.Struct({ id: ThreadMessageId.ThreadMessageId }),
    ({ id }) => ({ id })
  ),
  recordChanges(
    "ThreadParticipation",
    ThreadParticipation.ThreadParticipation,
    Schema.Struct({ id: ThreadParticipationId.ThreadParticipationId }),
    ({ id }) => ({ id })
  ),
  recordChanges(
    "ThreadPosition",
    ReadState.ThreadPosition,
    Schema.Struct({ memberId: MemberId.MemberId, threadId: ThreadId.ThreadId }),
    ({ memberId, threadId }) => ({ memberId, threadId })
  )
)

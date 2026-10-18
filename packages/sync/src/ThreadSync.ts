/**
 * What a member does in threads, as actions their browser writes: it applies each at once, and the
 * server runs it as a `ThreadService`, `ThreadMessageService`, `ThreadParticipationService`, or
 * `ReadStateService` operation.
 *
 * @since 0.1.0
 */

import { ReadState } from "@amends-dev/core/read-state"
import { Thread, ThreadId, ThreadMessage, ThreadMessageId, ThreadParticipation } from "@amends-dev/core/thread"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

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

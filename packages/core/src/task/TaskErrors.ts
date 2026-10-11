/**
 * The outcomes `TaskService` reports that a caller can act on. They are schemas, so protocols carry
 * them to clients; the service's error types add the failures of what it depends on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as GroupId from "../group/GroupId.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as MemberId from "../workspace/MemberId.ts";

/**
 * The group is missing, or the actor is not a member of it; the two are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "TaskService.GroupNotFound",
  {
    groupId: GroupId.Id,
  },
) {}

/**
 * The thread is missing, outside the actor's groups, or has no task; the three are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("TaskService.NotFound", {
  threadId: ThreadId.Id,
}) {}

/**
 * The thread is a task already; a thread has one.
 *
 * @category errors
 * @since 0.1.0
 */
export class AlreadyTask extends Schema.TaggedError<AlreadyTask>()("TaskService.AlreadyTask", {
  threadId: ThreadId.Id,
}) {}

/**
 * The task no longer holds the value the change replaces: it changed meanwhile, and nothing was
 * recorded.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("TaskService.Changed", {
  threadId: ThreadId.Id,
}) {}

/**
 * The assignee cannot take part in the thread: missing, inactive, or outside its group.
 *
 * @category errors
 * @since 0.1.0
 */
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "TaskService.ParticipantUnavailable",
  { memberId: MemberId.Id },
) {}

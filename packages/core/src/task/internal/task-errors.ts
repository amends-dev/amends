/**
 * The outcomes `TaskService` reports that a caller can act on. They are schemas, so protocols carry
 * them to clients; the service's error types add the failures of what it depends on.
 */
import { Schema } from "effect";
import * as ThreadId from "../../thread/ThreadId.ts";
import * as MemberId from "../../workspace/MemberId.ts";

/**
 * The thread is a task already; a thread has one.
 */
export class AlreadyTask extends Schema.TaggedError<AlreadyTask>()("TaskService.AlreadyTask", {
  threadId: ThreadId.Id,
}) {}

/**
 * The task no longer holds the value the change replaces: it changed meanwhile, and nothing was
 * recorded.
 */
export class Changed extends Schema.TaggedError<Changed>()("TaskService.Changed", {
  threadId: ThreadId.Id,
}) {}

/**
 * The assignee cannot take part in the thread: missing, inactive, or outside its group.
 */
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "TaskService.ParticipantUnavailable",
  { memberId: MemberId.Id },
) {}

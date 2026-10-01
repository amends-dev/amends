import { Schema } from "effect";
import { ThreadId } from "../thread/id.ts";
import { Turn } from "./turn.ts";

/** The outcomes turn operations report that a caller can act on; schemas only. */

/** Missing turns, and turns in threads the reader cannot open, share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("TurnService.NotFound", {
  turnId: Turn.Id,
}) {}

/** The turn has already finished, or is not in the state the operation needs. */
export class NotActive extends Schema.TaggedError<NotActive>()("TurnService.NotActive", {
  turnId: Turn.Id,
  status: Turn.Status,
}) {}

/** The turn can't be retried, for this reason. */
export class NotRetryable extends Schema.TaggedError<NotRetryable>()("TurnService.NotRetryable", {
  turnId: Turn.Id,
  reason: Turn.NotRetryableReason,
}) {}

/** The thread is missing, or the reader cannot open it. */
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "TurnService.ThreadNotFound",
  { threadId: ThreadId.Id },
) {}

export * as TurnErrors from "./errors.ts";

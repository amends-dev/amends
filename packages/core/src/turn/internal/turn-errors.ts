/**
 * The outcomes `TurnService` and `TurnExecution` report that a caller can act on. They are
 * schemas, so protocols carry them to clients; each service's error types add the failures of what
 * it depends on.
 */
import { Schema } from "effect";
import * as Turn from "../Turn.ts";

/**
 * Missing turns, and turns in threads the reader cannot open, share this outcome.
 */
export class NotFound extends Schema.TaggedError<NotFound>()("TurnService.NotFound", {
  turnId: Turn.Id,
}) {}

/**
 * The turn has already finished, or is not in the state the operation needs.
 */
export class NotActive extends Schema.TaggedError<NotActive>()("TurnService.NotActive", {
  turnId: Turn.Id,
  status: Turn.Status,
}) {}

/**
 * The turn cannot be retried now, for `reason`: it is still active, it completed, a later turn of
 * its agent superseded it, or its agent no longer takes part in the thread.
 */
export class NotRetryable extends Schema.TaggedError<NotRetryable>()("TurnService.NotRetryable", {
  turnId: Turn.Id,
  reason: Turn.NotRetryableReason,
}) {}

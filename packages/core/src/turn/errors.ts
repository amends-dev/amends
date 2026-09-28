import { Schema } from "effect";
import { Turn } from "./turn.ts";

/** The outcomes turn operations report that a caller can act on; schemas only. */

/** Missing turns, and turns in threads the reader cannot open, share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("TurnApplication.NotFound", {
  turnId: Turn.Id,
}) {}

/** The turn has already finished, or is not in the state the operation needs. */
export class NotActive extends Schema.TaggedError<NotActive>()("TurnApplication.NotActive", {
  turnId: Turn.Id,
  status: Turn.Status,
}) {}

export * as TurnErrors from "./errors.ts";

import { Schema } from "effect";
import { Transcript } from "./transcript.ts";

/** A session was asked to act before its history was prepared. */
export class NotPrepared extends Schema.TaggedError<NotPrepared>()("Harness.NotPrepared", {}) {}

/** History is prepared once per session, before any work. */
export class AlreadyPrepared extends Schema.TaggedError<AlreadyPrepared>()(
  "Harness.AlreadyPrepared",
  {},
) {}

/** The transcript breaks the order every provider requires. */
export class InvalidTranscript extends Schema.TaggedError<InvalidTranscript>()(
  "Harness.InvalidTranscript",
  { reason: Schema.String },
) {}

/** The harness cannot prepare its native context from this transcript. */
export class Unsupported extends Schema.TaggedError<Unsupported>()("Harness.Unsupported", {
  reason: Schema.String,
}) {}

/** A result was supplied for a call that is not waiting for one from outside this session. */
export class NotPending extends Schema.TaggedError<NotPending>()("Harness.NotPending", {
  callId: Transcript.ToolCallId,
}) {}

/**
 * The session stopped: its model or its own work failed. What it recorded before stopping stands,
 * so another session can continue from the transcript; `retryable` says whether trying the same
 * work again can succeed without a change.
 */
export class ExecutionFailed extends Schema.TaggedError<ExecutionFailed>()(
  "Harness.ExecutionFailed",
  { reason: Schema.String, retryable: Schema.Boolean },
) {}

export * as HarnessErrors from "./errors.ts";

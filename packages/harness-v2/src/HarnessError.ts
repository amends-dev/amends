/**
 * Errors a harness reports when it cannot do what it was asked: start or resume a session, run or
 * continue a turn, or change the session's lifecycle. A failure the agent reports during a turn,
 * such as its model rejecting a key, arrives in the turn's stream as an `error` part, and the turn
 * finishes with the reason `error`. Only `generate` and `generateObject`, which return a whole turn,
 * fail on it, with `TurnFailedError`.
 *
 * `HarnessError` says which harness and method failed and holds the reason, so callers can recover
 * from one reason with `Effect.catchReason("HarnessError", "NotFoundError", ...)`.
 */
import { Schema } from "effect";
import { Response } from "effect/ai";

export class UnsupportedError extends Schema.TaggedError<UnsupportedError>(
  "@amends/harness-v2/HarnessError/UnsupportedError",
)("UnsupportedError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The harness does not support this operation";
  }
}

export class NotFoundError extends Schema.TaggedError<NotFoundError>(
  "@amends/harness-v2/HarnessError/NotFoundError",
)("NotFoundError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The session no longer exists";
  }
}

export class TurnInProgressError extends Schema.TaggedError<TurnInProgressError>(
  "@amends/harness-v2/HarnessError/TurnInProgressError",
)("TurnInProgressError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The session is already running a turn";
  }
}

/** The agent reported that the turn failed, with the error of its `error` part. */
export class TurnFailedError extends Schema.TaggedError<TurnFailedError>(
  "@amends/harness-v2/HarnessError/TurnFailedError",
)("TurnFailedError", {
  description: Schema.optional(Schema.String),
  error: Schema.Unknown,
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The agent reported that the turn failed";
  }
}

/** The agent sent output the harness cannot read, such as an event it cannot translate. */
export class InvalidOutputError extends Schema.TaggedError<InvalidOutputError>(
  "@amends/harness-v2/HarnessError/InvalidOutputError",
)("InvalidOutputError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The agent sent output the harness cannot read";
  }
}

/** The agent's answer to a request for an object did not match its schema. Asking again may succeed. */
export class StructuredOutputError extends Schema.TaggedError<StructuredOutputError>(
  "@amends/harness-v2/HarnessError/StructuredOutputError",
)("StructuredOutputError", {
  description: Schema.optional(Schema.String),
  responseText: Schema.String,
  usage: Schema.optional(Schema.toEncoded(Response.Usage)),
}) {
  get isRetryable(): boolean {
    return true;
  }

  override get message(): string {
    return this.description ?? "The agent's answer did not match the requested schema";
  }
}

export class UnavailableError extends Schema.TaggedError<UnavailableError>(
  "@amends/harness-v2/HarnessError/UnavailableError",
)("UnavailableError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return true;
  }

  override get message(): string {
    return this.description ?? "The agent cannot be reached right now";
  }
}

export class UnknownError extends Schema.TaggedError<UnknownError>(
  "@amends/harness-v2/HarnessError/UnknownError",
)("UnknownError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The harness failed";
  }
}

// TODO: Add a HistoryUnavailableError reason with reading the agent's own history, for an agent
// whose store the harness cannot reach from where it runs.
export const HarnessErrorReason = Schema.Union([
  UnsupportedError,
  NotFoundError,
  TurnInProgressError,
  TurnFailedError,
  InvalidOutputError,
  StructuredOutputError,
  UnavailableError,
  UnknownError,
]);

export type HarnessErrorReason = typeof HarnessErrorReason.Type;

export class HarnessError extends Schema.TaggedError<HarnessError>(
  "@amends/harness-v2/HarnessError",
)("HarnessError", {
  harness: Schema.String,
  method: Schema.String,
  reason: HarnessErrorReason,
  cause: Schema.optional(Schema.Defect()),
}) {
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }

  override get message(): string {
    return `${this.harness}.${this.method}: ${this.reason.message}`;
  }
}

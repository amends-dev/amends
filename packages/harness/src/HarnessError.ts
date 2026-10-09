/**
 * Errors a harness reports when it cannot do what it was asked: start or resume a session, run or
 * continue a turn, or change the session's lifecycle. A failure the agent reports during a turn,
 * such as its model rejecting a key, arrives in the turn's stream as an `error` part, and the turn
 * finishes with the reason `error`. Only `generate` and `generateObject`, which return a whole turn,
 * fail on it, with `TurnFailedError`.
 *
 * `HarnessError` says which agent failed and holds the reason, so callers can recover from one
 * reason with `Effect.catchReason("HarnessError", "NotFoundError", ...)`. The operation that failed
 * is the one the caller ran, which its span names.
 */
import { Schema } from "effect";
import { Response } from "effect/ai";

/** The field every reason has: what happened, in the words of whoever reports it. */
const described = { description: Schema.optional(Schema.String) };

/**
 * Gives a reason its message, its description or `defaults.message` without one, and whether
 * trying again may succeed.
 */
const withDefaults = <
  // A class a mixin extends must take `any[]`, as TypeScript requires.
  Base extends new (...args: any[]) => { readonly description?: string | undefined },
>(
  Base: Base,
  defaults: { readonly message: string; readonly isRetryable: boolean },
) =>
  class extends Base {
    get isRetryable(): boolean {
      return defaults.isRetryable;
    }

    get message(): string {
      return this.description ?? defaults.message;
    }
  };

export class UnsupportedError extends withDefaults(
  Schema.TaggedError<UnsupportedError>("@amends/harness/HarnessError/UnsupportedError")(
    "UnsupportedError",
    described,
  ),
  { message: "The harness does not support this operation", isRetryable: false },
) {}

/** Something the agent was asked about does not exist, such as a session it lost. */
export class NotFoundError extends withDefaults(
  Schema.TaggedError<NotFoundError>("@amends/harness/HarnessError/NotFoundError")(
    "NotFoundError",
    described,
  ),
  { message: "The agent has no such session", isRetryable: false },
) {}

/**
 * The session was released: `Harness.createSession` picks it up again from what that returned, as
 * `resumeFrom`.
 */
export class SessionClosedError extends withDefaults(
  Schema.TaggedError<SessionClosedError>("@amends/harness/HarnessError/SessionClosedError")(
    "SessionClosedError",
    described,
  ),
  {
    message: "The session was suspended, detached, stopped, or destroyed",
    isRetryable: false,
  },
) {}

export class TurnInProgressError extends withDefaults(
  Schema.TaggedError<TurnInProgressError>("@amends/harness/HarnessError/TurnInProgressError")(
    "TurnInProgressError",
    described,
  ),
  { message: "The session is already running a turn", isRetryable: false },
) {}

/** The session has no turn for the operation: none running to suspend, or none to continue. */
export class NoTurnError extends withDefaults(
  Schema.TaggedError<NoTurnError>("@amends/harness/HarnessError/NoTurnError")(
    "NoTurnError",
    described,
  ),
  { message: "The session has no turn for this", isRetryable: false },
) {}

/** The agent reported that the turn failed, with the error of its `error` part. */
export class TurnFailedError extends withDefaults(
  Schema.TaggedError<TurnFailedError>("@amends/harness/HarnessError/TurnFailedError")(
    "TurnFailedError",
    { ...described, error: Schema.Unknown },
  ),
  { message: "The agent reported that the turn failed", isRetryable: false },
) {}

/** The agent sent output the harness cannot read, such as an event it cannot translate. */
export class InvalidOutputError extends withDefaults(
  Schema.TaggedError<InvalidOutputError>("@amends/harness/HarnessError/InvalidOutputError")(
    "InvalidOutputError",
    described,
  ),
  { message: "The agent sent output the harness cannot read", isRetryable: false },
) {}

/** The agent's answer to a request for an object did not match its schema. Asking again may succeed. */
export class StructuredOutputError extends withDefaults(
  Schema.TaggedError<StructuredOutputError>("@amends/harness/HarnessError/StructuredOutputError")(
    "StructuredOutputError",
    {
      ...described,
      responseText: Schema.String,
      usage: Schema.optional(Schema.toEncoded(Response.Usage)),
    },
  ),
  { message: "The agent's answer did not match the requested schema", isRetryable: true },
) {}

export class UnavailableError extends withDefaults(
  Schema.TaggedError<UnavailableError>("@amends/harness/HarnessError/UnavailableError")(
    "UnavailableError",
    described,
  ),
  { message: "The agent cannot be reached right now", isRetryable: true },
) {}

export class UnknownError extends withDefaults(
  Schema.TaggedError<UnknownError>("@amends/harness/HarnessError/UnknownError")(
    "UnknownError",
    described,
  ),
  { message: "The harness failed", isRetryable: false },
) {}

// TODO: Add a HistoryUnavailableError reason with reading the agent's own history, for an agent
// whose store the harness cannot reach from where it runs.
export const HarnessErrorReason = Schema.Union([
  UnsupportedError,
  NotFoundError,
  SessionClosedError,
  TurnInProgressError,
  NoTurnError,
  TurnFailedError,
  InvalidOutputError,
  StructuredOutputError,
  UnavailableError,
  UnknownError,
]);

export type HarnessErrorReason = typeof HarnessErrorReason.Type;

export class HarnessError extends Schema.TaggedError<HarnessError>("@amends/harness/HarnessError")(
  "HarnessError",
  {
    /** The agent that failed, as `Agent.id` names it. */
    agent: Schema.String,
    reason: HarnessErrorReason,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }

  override get message(): string {
    return `${this.agent}: ${this.reason.message}`;
  }
}

/**
 * Errors a tool source reports when it cannot do what it was asked: tell which tools it has, or run
 * one. A tool that ran and reported its own failure is one of them, as `CallFailedError`.
 *
 * `ToolSourceError` says which source failed and holds the reason, so callers can recover from one
 * reason with `Effect.catchReason("ToolSourceError", "AuthenticationError", ...)`, as a host does
 * to ask for a connection again. The operation that failed is the one the caller ran, which its
 * span names.
 *
 * `modelMessage` is what a model reads of a failure. The descriptions of `InvalidInputError` and
 * `CallFailedError` are written for it, to say what to correct and what the tool said. The
 * description of any other reason may name an address or another internal, so the model reads only
 * its default message.
 */
import { Schema } from "effect";

/** The field every reason has: what happened, in the words of whoever reports it. */
const described = { description: Schema.optional(Schema.String) };

/**
 * Gives a reason its message, its description or `defaults.message` without one, what the model
 * reads of it, and whether trying again may succeed.
 */
const withDefaults = <
  // A class a mixin extends must take `any[]`, as TypeScript requires.
  Base extends new (...args: any[]) => { readonly description?: string | undefined },
>(
  Base: Base,
  defaults: {
    readonly message: string;
    readonly isRetryable: boolean;

    /** Whether the description is written for the model to read, as for a failure it can act on. */
    readonly readByModel?: boolean;
  },
) =>
  class extends Base {
    get isRetryable(): boolean {
      return defaults.isRetryable;
    }

    get message(): string {
      return this.description ?? defaults.message;
    }

    get modelMessage(): string {
      return defaults.readByModel === true ? this.message : defaults.message;
    }
  };

/** The source's credentials are missing, invalid, or not allowed to do this. */
export class AuthenticationError extends withDefaults(
  Schema.TaggedError<AuthenticationError>("@amends/toolkit/ToolSourceError/AuthenticationError")(
    "AuthenticationError",
    described,
  ),
  {
    message: "The credentials for this tool are missing, invalid, or not authorized",
    isRetryable: false,
  },
) {}

/** The source has no tool of the name it was asked to run, such as one it has removed since. */
export class NotFoundError extends withDefaults(
  Schema.TaggedError<NotFoundError>("@amends/toolkit/ToolSourceError/NotFoundError")(
    "NotFoundError",
    described,
  ),
  { message: "The source has no tool of this name", isRetryable: false },
) {}

/** The input does not match the tool's parameters. Its description says what to correct. */
export class InvalidInputError extends withDefaults(
  Schema.TaggedError<InvalidInputError>("@amends/toolkit/ToolSourceError/InvalidInputError")(
    "InvalidInputError",
    described,
  ),
  {
    message: "The input does not match the tool's parameters",
    isRetryable: false,
    readByModel: true,
  },
) {}

/** The tool ran and reported that it failed. Its description is what the tool said. */
export class CallFailedError extends withDefaults(
  Schema.TaggedError<CallFailedError>("@amends/toolkit/ToolSourceError/CallFailedError")(
    "CallFailedError",
    described,
  ),
  { message: "The tool reported a failure", isRetryable: false, readByModel: true },
) {}

// TODO: Say when to try again, which a rate limit gives, once a caller retries by it.
export class UnavailableError extends withDefaults(
  Schema.TaggedError<UnavailableError>("@amends/toolkit/ToolSourceError/UnavailableError")(
    "UnavailableError",
    described,
  ),
  { message: "The source is temporarily unavailable", isRetryable: true },
) {}

/** The source answered in a way its protocol does not allow, such as a result that is not JSON. */
export class InvalidResponseError extends withDefaults(
  Schema.TaggedError<InvalidResponseError>("@amends/toolkit/ToolSourceError/InvalidResponseError")(
    "InvalidResponseError",
    described,
  ),
  { message: "The source answered in a way its protocol does not allow", isRetryable: false },
) {}

export class UnsupportedError extends withDefaults(
  Schema.TaggedError<UnsupportedError>("@amends/toolkit/ToolSourceError/UnsupportedError")(
    "UnsupportedError",
    described,
  ),
  { message: "The source does not support this operation", isRetryable: false },
) {}

export class UnknownError extends withDefaults(
  Schema.TaggedError<UnknownError>("@amends/toolkit/ToolSourceError/UnknownError")(
    "UnknownError",
    described,
  ),
  { message: "The source failed", isRetryable: false },
) {}

export const ToolSourceErrorReason = Schema.Union([
  AuthenticationError,
  NotFoundError,
  InvalidInputError,
  CallFailedError,
  UnavailableError,
  InvalidResponseError,
  UnsupportedError,
  UnknownError,
]);

export type ToolSourceErrorReason = typeof ToolSourceErrorReason.Type;

export class ToolSourceError extends Schema.TaggedError<ToolSourceError>(
  "@amends/toolkit/ToolSourceError",
)("ToolSourceError", {
  /** The source that failed, as its name gives it, such as `github`. */
  source: Schema.String,
  reason: ToolSourceErrorReason,
  cause: Schema.optional(Schema.Defect()),
}) {
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }

  override get message(): string {
    return `${this.source}: ${this.reason.message}`;
  }
}

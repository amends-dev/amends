/**
 * Errors a sandbox provider reports for operations on the sandbox itself: creating, resuming,
 * stopping, and configuring it. File and process operations inside a sandbox fail with Effect's
 * `PlatformError` instead, as `FileSystem` and `ChildProcessSpawner` define.
 *
 * `SandboxError` says which provider failed and holds the reason, so callers can recover from one
 * reason with `Effect.catchReason("SandboxError", "NotFoundError", ...)`. The operation that failed
 * is the one the caller ran, which its span names.
 */
import { Schema } from "effect";

/** The field every reason has: what happened, in the provider's words. */
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

export class AuthenticationError extends withDefaults(
  Schema.TaggedError<AuthenticationError>("@amends/sandbox-v2/SandboxError/AuthenticationError")(
    "AuthenticationError",
    described,
  ),
  {
    message: "The provider's credentials are missing, invalid, or not authorized",
    isRetryable: false,
  },
) {}

export class NotFoundError extends withDefaults(
  Schema.TaggedError<NotFoundError>("@amends/sandbox-v2/SandboxError/NotFoundError")(
    "NotFoundError",
    described,
  ),
  { message: "The sandbox does not exist", isRetryable: false },
) {}

export class AlreadyExistsError extends withDefaults(
  Schema.TaggedError<AlreadyExistsError>("@amends/sandbox-v2/SandboxError/AlreadyExistsError")(
    "AlreadyExistsError",
    described,
  ),
  { message: "A sandbox with this id already exists", isRetryable: false },
) {}

export class UnsupportedError extends withDefaults(
  Schema.TaggedError<UnsupportedError>("@amends/sandbox-v2/SandboxError/UnsupportedError")(
    "UnsupportedError",
    described,
  ),
  { message: "The provider does not support this operation", isRetryable: false },
) {}

export class UnavailableError extends withDefaults(
  Schema.TaggedError<UnavailableError>("@amends/sandbox-v2/SandboxError/UnavailableError")(
    "UnavailableError",
    described,
  ),
  { message: "The provider is temporarily unavailable", isRetryable: true },
) {}

export class UnknownError extends withDefaults(
  Schema.TaggedError<UnknownError>("@amends/sandbox-v2/SandboxError/UnknownError")(
    "UnknownError",
    described,
  ),
  { message: "The provider failed", isRetryable: false },
) {}

export const SandboxErrorReason = Schema.Union([
  AuthenticationError,
  NotFoundError,
  AlreadyExistsError,
  UnsupportedError,
  UnavailableError,
  UnknownError,
]);

export type SandboxErrorReason = typeof SandboxErrorReason.Type;

export class SandboxError extends Schema.TaggedError<SandboxError>(
  "@amends/sandbox-v2/SandboxError",
)("SandboxError", {
  /** The provider that failed, such as `local`. */
  provider: Schema.String,
  reason: SandboxErrorReason,
  cause: Schema.optional(Schema.Defect()),
}) {
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }

  override get message(): string {
    return `${this.provider}: ${this.reason.message}`;
  }
}

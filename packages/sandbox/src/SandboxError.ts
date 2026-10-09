/**
 * Errors a sandbox provider reports for operations on the sandbox itself: creating, resuming,
 * stopping, and configuring it. File and process operations inside a sandbox fail with Effect's
 * `PlatformError` instead, as `FileSystem` and `ChildProcessSpawner` define.
 *
 * `SandboxError` says which provider failed and holds the reason, so callers can recover from one
 * reason with `Effect.catchReason("SandboxError", "NotFoundError", ...)`. The operation that failed
 * is the one the caller ran, which its span names. Each reason has a `description`, what happened
 * in the provider's words, and says with `isRetryable` whether trying again may succeed, as the
 * reasons of `AiError` do.
 *
 * @since 0.1.0
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

/**
 * The provider's credentials are missing, invalid, or not authorized for the operation.
 *
 * @category errors
 * @since 0.1.0
 */
export class AuthenticationError extends withDefaults(
  Schema.TaggedError<AuthenticationError>("@amends/sandbox/SandboxError/AuthenticationError")(
    "AuthenticationError",
    described,
  ),
  {
    message: "The provider's credentials are missing, invalid, or not authorized",
    isRetryable: false,
  },
) {}

/**
 * The sandbox does not exist, as for an unknown or destroyed id, or it does not expose the port.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFoundError extends withDefaults(
  Schema.TaggedError<NotFoundError>("@amends/sandbox/SandboxError/NotFoundError")(
    "NotFoundError",
    described,
  ),
  { message: "The sandbox does not exist", isRetryable: false },
) {}

/**
 * A sandbox with the id `create` was given exists already.
 *
 * @category errors
 * @since 0.1.0
 */
export class AlreadyExistsError extends withDefaults(
  Schema.TaggedError<AlreadyExistsError>("@amends/sandbox/SandboxError/AlreadyExistsError")(
    "AlreadyExistsError",
    described,
  ),
  { message: "A sandbox with this id already exists", isRetryable: false },
) {}

/**
 * The provider cannot do this on its platform, such as enforce a network policy, transform
 * requests, or expose a port once the sandbox exists.
 *
 * @category errors
 * @since 0.1.0
 */
export class UnsupportedError extends withDefaults(
  Schema.TaggedError<UnsupportedError>("@amends/sandbox/SandboxError/UnsupportedError")(
    "UnsupportedError",
    described,
  ),
  { message: "The provider does not support this operation", isRetryable: false },
) {}

/**
 * The provider cannot be reached right now, or asks for fewer requests. Trying again may succeed.
 *
 * @category errors
 * @since 0.1.0
 */
export class UnavailableError extends withDefaults(
  Schema.TaggedError<UnavailableError>("@amends/sandbox/SandboxError/UnavailableError")(
    "UnavailableError",
    described,
  ),
  { message: "The provider is temporarily unavailable", isRetryable: true },
) {}

/**
 * The provider failed for a reason none of the others names.
 *
 * @category errors
 * @since 0.1.0
 */
export class UnknownError extends withDefaults(
  Schema.TaggedError<UnknownError>("@amends/sandbox/SandboxError/UnknownError")(
    "UnknownError",
    described,
  ),
  { message: "The provider failed", isRetryable: false },
) {}

/**
 * Why a sandbox operation failed: one of the errors above, which `SandboxError.reason` holds.
 *
 * @category errors
 * @since 0.1.0
 */
export const SandboxErrorReason = Schema.Union([
  AuthenticationError,
  NotFoundError,
  AlreadyExistsError,
  UnsupportedError,
  UnavailableError,
  UnknownError,
]);

/**
 * @category errors
 * @since 0.1.0
 */
export type SandboxErrorReason = typeof SandboxErrorReason.Type;

/**
 * The error every operation on a sandbox fails with: which provider failed, and why.
 *
 * **Example** (Recovering from one reason)
 *
 * ```ts
 * import { Sandbox, SandboxProvider } from "@amends/sandbox";
 * import { Effect } from "effect";
 *
 * declare const id: Sandbox.SandboxId;
 *
 * // The sandbox with this id, created if it does not exist yet.
 * const sandbox = Effect.gen(function* () {
 *   const sandboxProvider = yield* SandboxProvider.SandboxProvider;
 *   return yield* sandboxProvider
 *     .resume(id)
 *     .pipe(
 *       Effect.catchReason("SandboxError", "NotFoundError", () => sandboxProvider.create({ id })),
 *     );
 * });
 * ```
 *
 * @category errors
 * @since 0.1.0
 */
export class SandboxError extends Schema.TaggedError<SandboxError>("@amends/sandbox/SandboxError")(
  "SandboxError",
  {
    /** The provider that failed, such as `local`. */
    provider: Schema.String,
    reason: SandboxErrorReason,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }

  override get message(): string {
    return `${this.provider}: ${this.reason.message}`;
  }
}

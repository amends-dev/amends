/**
 * Errors a sandbox provider reports for operations on the sandbox itself: creating, resuming,
 * stopping, and configuring it. File and process operations inside a sandbox fail with Effect's
 * `PlatformError` instead, as `FileSystem` and `ChildProcessSpawner` define.
 *
 * `SandboxError` says where a failure happened and holds the reason, so callers can recover from
 * one reason with `Effect.catchReason("SandboxError", "NotFoundError", ...)`.
 */
import { Schema } from "effect";

export class AuthenticationError extends Schema.TaggedError<AuthenticationError>(
  "@amends/sandbox-v2/SandboxError/AuthenticationError",
)("AuthenticationError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The provider's credentials are missing, invalid, or not authorized";
  }
}

export class NotFoundError extends Schema.TaggedError<NotFoundError>(
  "@amends/sandbox-v2/SandboxError/NotFoundError",
)("NotFoundError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The sandbox does not exist";
  }
}

export class AlreadyExistsError extends Schema.TaggedError<AlreadyExistsError>(
  "@amends/sandbox-v2/SandboxError/AlreadyExistsError",
)("AlreadyExistsError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "A sandbox with this id already exists";
  }
}

export class UnsupportedError extends Schema.TaggedError<UnsupportedError>(
  "@amends/sandbox-v2/SandboxError/UnsupportedError",
)("UnsupportedError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The provider does not support this operation";
  }
}

export class UnavailableError extends Schema.TaggedError<UnavailableError>(
  "@amends/sandbox-v2/SandboxError/UnavailableError",
)("UnavailableError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return true;
  }

  override get message(): string {
    return this.description ?? "The provider is temporarily unavailable";
  }
}

export class UnknownError extends Schema.TaggedError<UnknownError>(
  "@amends/sandbox-v2/SandboxError/UnknownError",
)("UnknownError", {
  description: Schema.optional(Schema.String),
}) {
  get isRetryable(): boolean {
    return false;
  }

  override get message(): string {
    return this.description ?? "The provider failed";
  }
}

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
  provider: Schema.String,
  method: Schema.String,
  reason: SandboxErrorReason,
  cause: Schema.optional(Schema.Defect()),
}) {
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }

  override get message(): string {
    return `${this.provider}.${this.method}: ${this.reason.message}`;
  }
}

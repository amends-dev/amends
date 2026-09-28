import { Schema } from "effect";

/**
 * The provider could not do what was asked: its API refused, failed, or could not be reached.
 * `retryable` says whether asking again unchanged can succeed.
 */
export class ProviderFailure extends Schema.TaggedError<ProviderFailure>()(
  "Sandbox.ProviderFailure",
  { reason: Schema.String, retryable: Schema.Boolean },
) {}

/** The provider does not declare the capability this operation needs. */
export class Unsupported extends Schema.TaggedError<Unsupported>()("Sandbox.Unsupported", {
  capability: Schema.String,
}) {}

/** No file exists at the path. */
export class FileNotFound extends Schema.TaggedError<FileNotFound>()("Sandbox.FileNotFound", {
  path: Schema.String,
}) {}

/** The snapshot cannot be restored: it expired, was deleted, or belongs to another provider. */
export class SnapshotUnavailable extends Schema.TaggedError<SnapshotUnavailable>()(
  "Sandbox.SnapshotUnavailable",
  { reason: Schema.String },
) {}

export * as SandboxErrors from "./errors.ts";

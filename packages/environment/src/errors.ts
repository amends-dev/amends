import { Schema } from "effect";

/** The environment's harness is not one this host installed. */
export class HarnessUnavailable extends Schema.TaggedError<HarnessUnavailable>()(
  "Environment.HarnessUnavailable",
  { harnessId: Schema.String },
) {}

/** The environment's sandbox provider is not one this host runs environments with. */
export class SandboxUnavailable extends Schema.TaggedError<SandboxUnavailable>()(
  "Environment.SandboxUnavailable",
  { providerId: Schema.String },
) {}

/** A setup command the definition requires failed, so spawning failed. */
export class SetupFailed extends Schema.TaggedError<SetupFailed>()("Environment.SetupFailed", {
  command: Schema.String,
  exitCode: Schema.Int,
  stdout: Schema.String,
  stderr: Schema.String,
}) {}

/** The harness server has no build for the sandbox's operating system and processor. */
export class UnsupportedPlatform extends Schema.TaggedError<UnsupportedPlatform>()(
  "Environment.UnsupportedPlatform",
  { platform: Schema.String },
) {}

/** The harness server could not be started in the sandbox, or does not answer there. */
export class HarnessServerFailed extends Schema.TaggedError<HarnessServerFailed>()(
  "Environment.HarnessServerFailed",
  { reason: Schema.String },
) {}

/** The running environment to reacquire belongs to another definition. */
export class ForeignReference extends Schema.TaggedError<ForeignReference>()(
  "Environment.ForeignReference",
  { definitionId: Schema.String },
) {}

export * as EnvironmentErrors from "./errors.ts";

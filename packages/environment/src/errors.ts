import { Schema } from "effect";

/** A setup command the definition requires failed, so spawning failed. */
export class SetupFailed extends Schema.TaggedError<SetupFailed>()("Environment.SetupFailed", {
  argv: Schema.Array(Schema.String),
  exitCode: Schema.Int,
  stdout: Schema.String,
  stderr: Schema.String,
}) {}

/** The running environment to reacquire belongs to another definition. */
export class ForeignReference extends Schema.TaggedError<ForeignReference>()(
  "Environment.ForeignReference",
  { definitionId: Schema.String },
) {}

/** The running environment was released; nothing more runs in it. */
export class Released extends Schema.TaggedError<Released>()("Environment.Released", {}) {}

export * as EnvironmentErrors from "./errors.ts";

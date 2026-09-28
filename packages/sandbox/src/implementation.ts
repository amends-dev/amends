import { Schema } from "effect";

/** Names a sandbox provider in environments and the catalog, such as `daytona`. */
export const Id = Schema.NonEmptyString.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)).pipe(
  Schema.brand("SandboxImplementationId"),
);
export type Id = typeof Id.Type;

/** What a provider can do beyond the operations every provider supports. */
export const Capabilities = Schema.Struct({
  stdin: Schema.Boolean,
  snapshots: Schema.Literals(["none", "filesystem", "filesystem-and-memory"]),
  isolated: Schema.Boolean,
});
export interface Capabilities extends Schema.Schema.Type<typeof Capabilities> {}

/**
 * What a sandbox provider declares about itself: the data a host registers in its catalog and an
 * app shows when someone sets up an environment.
 */
export const Declaration = Schema.Struct({
  id: Id,
  name: Schema.NonEmptyString,
  description: Schema.String,
  capabilities: Capabilities,
  /**
   * Whether its sandboxes run under an account the workspace connects: a connection whose
   * implementation declares the sandbox capability for this provider.
   */
  account: Schema.Boolean,
  /** How it describes the starting point a new sandbox takes, if it takes one. */
  template: Schema.optionalKey(
    Schema.Struct({
      label: Schema.NonEmptyString,
      description: Schema.optionalKey(Schema.String),
      placeholder: Schema.optionalKey(Schema.String),
    }),
  ),
});
export interface Declaration extends Schema.Schema.Type<typeof Declaration> {}

export * as SandboxImplementation from "./implementation.ts";

import { Schema } from "effect";

/** Names an implementation in connection records and the catalog, such as `anthropic`. */
export const Id = Schema.NonEmptyString.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)).pipe(
  Schema.brand("ConnectionImplementationId"),
);
export type Id = typeof Id.Type;

/**
 * A setting a connection of this implementation takes, described so an app can ask for it.
 * Settings are never secret; secrets are credentials.
 */
export const Setting = Schema.Struct({
  key: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  kind: Schema.Literals(["text", "url"]),
  required: Schema.Boolean,
  description: Schema.optionalKey(Schema.String),
  placeholder: Schema.optionalKey(Schema.String),
});
export interface Setting extends Schema.Schema.Type<typeof Setting> {}

/**
 * A way connections of this implementation authenticate with the external system. OAuth joins
 * these with the first implementation that needs it.
 */
export const Authentication = Schema.TaggedUnion({
  /** No credential, such as a public MCP server. */
  None: {},
  /** A secret the person connecting supplies, such as an API key, kept in protected storage. */
  ApiKey: { label: Schema.NonEmptyString },
});
export type Authentication = typeof Authentication.Type;

/**
 * What connections of this implementation can be used for. Each capability corresponds to a
 * contract the implementation's code fulfils, never a label; toolkit and channel support join with
 * their contracts.
 */
export const Capabilities = Schema.Struct({
  /**
   * Access to a model provider through the named interface, such as `anthropic-messages`, which a
   * harness must support to use the connection.
   */
  modelInference: Schema.optionalKey(Schema.Struct({ interface: Schema.NonEmptyString })),
});
export interface Capabilities extends Schema.Schema.Type<typeof Capabilities> {}

export type Capability = keyof Capabilities;

/**
 * What an implementation declares about itself: the data a host registers in its catalog, core
 * checks connections against, and an app shows when someone adds a connection.
 */
export const Declaration = Schema.Struct({
  id: Id,
  name: Schema.NonEmptyString,
  description: Schema.String,
  capabilities: Capabilities,
  settings: Schema.Array(Setting),
  authentication: Schema.NonEmptyArray(Authentication),
});
export interface Declaration extends Schema.Schema.Type<typeof Declaration> {}

export * as ConnectionImplementation from "./implementation.ts";

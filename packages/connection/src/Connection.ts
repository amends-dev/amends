/**
 * A connection is a workspace's link to one integration, such as its Anthropic account or the MCP
 * server of its issue tracker: the settings the integration takes, such as a URL, and how the
 * connection authenticates. The secret it authenticates with is its credential, which is kept apart
 * from it, so that a connection can be shown and stored without it.
 *
 * `ConnectionError` is what a connection that cannot be used as asked fails with, and `Health` what
 * checking a connection finds.
 */
import { Schema } from "effect";

export const ConnectionId = Schema.NonEmptyString.pipe(Schema.brand("ConnectionId"));

export type ConnectionId = typeof ConnectionId.Type;

// TODO: Add OAuth, once an integration a connection is made to takes it.
/** How a connection authenticates: with an API key, or not at all. */
export const AuthMethod = Schema.Literals(["apiKey", "none"]);

export type AuthMethod = typeof AuthMethod.Type;

export const Connection = Schema.Struct({
  id: ConnectionId,

  /** The integration the connection links to, as its id names it. */
  integration: Schema.NonEmptyString,

  /** What the workspace calls the connection, such as `Work Anthropic`. */
  name: Schema.NonEmptyString,

  /** The settings the connection's integration takes, as JSON. */
  settings: Schema.Record(Schema.String, Schema.Json),

  /** How the connection authenticates, as one of the methods its integration offers. */
  auth: AuthMethod,
});

export interface Connection extends Schema.Schema.Type<typeof Connection> {}

/** The secret a connection authenticates with: its API key. */
export const Credential = Schema.Struct({ apiKey: Schema.Redacted(Schema.String) });

export interface Credential extends Schema.Schema.Type<typeof Credential> {}

/**
 * What checking a connection finds: that nothing the check could see is wrong, that the system
 * refused the credential, that the settings lead nowhere the integration works, or that the system
 * could not answer, which may pass.
 */
export const Health = Schema.Struct({
  status: Schema.Literals(["healthy", "unauthorized", "misconfigured", "unavailable"]),

  /** What the check found, for a status other than `healthy`. */
  description: Schema.optionalKey(Schema.String),
});

export interface Health extends Schema.Schema.Type<typeof Health> {}

const described = { description: Schema.String };

/** The host has no integration of the id a connection names. */
export class NotFoundError extends Schema.TaggedError<NotFoundError>(
  "@amends/connection/ConnectionError/NotFoundError",
)("NotFoundError", described) {
  override get message(): string {
    return this.description;
  }
}

/**
 * The connection is not one its integration takes: its settings do not match, it authenticates in
 * a way the integration does not offer, or it has no credential to authenticate with.
 */
export class InvalidConnectionError extends Schema.TaggedError<InvalidConnectionError>(
  "@amends/connection/ConnectionError/InvalidConnectionError",
)("InvalidConnectionError", described) {
  override get message(): string {
    return this.description;
  }
}

/**
 * The integration does not give what was asked of the connection, such as models from an
 * integration of tools, or a model or an effort it does not offer.
 */
export class UnsupportedError extends Schema.TaggedError<UnsupportedError>(
  "@amends/connection/ConnectionError/UnsupportedError",
)("UnsupportedError", described) {
  override get message(): string {
    return this.description;
  }
}

/** The integration's system could not be reached for what was asked, which may pass. */
export class UnavailableError extends Schema.TaggedError<UnavailableError>(
  "@amends/connection/ConnectionError/UnavailableError",
)("UnavailableError", described) {
  override get message(): string {
    return this.description;
  }
}

export const ConnectionErrorReason = Schema.Union([
  NotFoundError,
  InvalidConnectionError,
  UnsupportedError,
  UnavailableError,
]);

export type ConnectionErrorReason = typeof ConnectionErrorReason.Type;

export class ConnectionError extends Schema.TaggedError<ConnectionError>(
  "@amends/connection/ConnectionError",
)("ConnectionError", {
  /** The integration of the connection, as its id names it. */
  integration: Schema.String,
  reason: ConnectionErrorReason,
  cause: Schema.optional(Schema.Defect()),
}) {
  get isRetryable(): boolean {
    return this.reason._tag === "UnavailableError";
  }

  override get message(): string {
    return `${this.integration}: ${this.reason.message}`;
  }
}

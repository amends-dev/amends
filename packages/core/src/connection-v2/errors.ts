import { Schema } from "effect";
import { ConnectionV2 } from "./connection.ts";

/** The outcomes `ConnectionV2Service` reports that a caller can act on; schemas only. */

/** Missing, removed, and unreadable connections share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("ConnectionV2Service.NotFound", {
  connectionId: ConnectionV2.Id,
}) {}

/** The connection's name is no longer the one expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("ConnectionV2Service.Changed", {
  connectionId: ConnectionV2.Id,
}) {}

/** This host does not install the integration. */
export class UnknownIntegration extends Schema.TaggedError<UnknownIntegration>()(
  "ConnectionV2Service.UnknownIntegration",
  { integration: Schema.String },
) {}

/**
 * The integration does not take the connection: its settings, or how it authenticates. The
 * description is the integration's, for the person who gave them.
 */
export class InvalidConnection extends Schema.TaggedError<InvalidConnection>()(
  "ConnectionV2Service.InvalidConnection",
  { description: Schema.String },
) {}

/** The connection authenticates with nothing, so it takes no key. */
export class Keyless extends Schema.TaggedError<Keyless>()("ConnectionV2Service.Keyless", {
  connectionId: ConnectionV2.Id,
}) {}

/** This host keeps no credentials, so no connection that authenticates with a key can be used. */
export class CredentialsUnavailable extends Schema.TaggedError<CredentialsUnavailable>()(
  "ConnectionV2Service.CredentialsUnavailable",
  { reason: Schema.String },
) {}

export * as ConnectionV2Errors from "./errors.ts";

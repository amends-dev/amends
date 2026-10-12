/**
 * The outcomes `ConnectionService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's error types add the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Connection from "../Connection.ts";

/**
 * This host does not install the integration, or no longer installs the one a connection names.
 */
export class UnknownIntegration extends Schema.TaggedError<UnknownIntegration>()(
  "ConnectionService.UnknownIntegration",
  { integration: Schema.String },
) {}

/**
 * The integration does not take the connection: its settings, how it authenticates, or, when
 * checking one that authenticates with a key, a missing key. The description is the integration's,
 * for the person who gave them.
 */
export class InvalidConnection extends Schema.TaggedError<InvalidConnection>()(
  "ConnectionService.InvalidConnection",
  { description: Schema.String },
) {}

/**
 * The connection authenticates with nothing, so it takes no key.
 */
export class Keyless extends Schema.TaggedError<Keyless>()("ConnectionService.Keyless", {
  connectionId: Connection.Id,
}) {}

/**
 * This host keeps no credentials, so no connection that authenticates with a key can be used.
 */
export class CredentialsUnavailable extends Schema.TaggedError<CredentialsUnavailable>()(
  "ConnectionService.CredentialsUnavailable",
  { reason: Schema.String },
) {}

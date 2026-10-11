import { Schema } from "effect";
import * as Connection from "./connection.ts";

/** The outcomes `ConnectionService` reports that a caller can act on; schemas only. */

/** Missing, removed, and unreadable connections share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("ConnectionService.NotFound", {
  connectionId: Connection.Id,
}) {}

/** The connection's name is no longer the one expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("ConnectionService.Changed", {
  connectionId: Connection.Id,
}) {}

/** This host does not install the integration. */
export class UnknownIntegration extends Schema.TaggedError<UnknownIntegration>()(
  "ConnectionService.UnknownIntegration",
  { integration: Schema.String },
) {}

/**
 * The integration does not take the connection: its settings, or how it authenticates. The
 * description is the integration's, for the person who gave them.
 */
export class InvalidConnection extends Schema.TaggedError<InvalidConnection>()(
  "ConnectionService.InvalidConnection",
  { description: Schema.String },
) {}

/** The connection authenticates with nothing, so it takes no key. */
export class Keyless extends Schema.TaggedError<Keyless>()("ConnectionService.Keyless", {
  connectionId: Connection.Id,
}) {}

/** This host keeps no credentials, so no connection that authenticates with a key can be used. */
export class CredentialsUnavailable extends Schema.TaggedError<CredentialsUnavailable>()(
  "ConnectionService.CredentialsUnavailable",
  { reason: Schema.String },
) {}

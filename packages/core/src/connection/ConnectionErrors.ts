/**
 * The outcomes `ConnectionService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's error types add the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Connection from "./Connection.ts";

/**
 * The connection is missing, removed, or not readable by the actor; the three are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("ConnectionService.NotFound", {
  connectionId: Connection.Id,
}) {}

/**
 * The connection's name is no longer the one expected: someone renamed it meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("ConnectionService.Changed", {
  connectionId: Connection.Id,
}) {}

/**
 * This host does not install the integration, or no longer installs the one a connection names.
 *
 * @category errors
 * @since 0.1.0
 */
export class UnknownIntegration extends Schema.TaggedError<UnknownIntegration>()(
  "ConnectionService.UnknownIntegration",
  { integration: Schema.String },
) {}

/**
 * The integration does not take the connection: its settings, how it authenticates, or, when
 * checking one that authenticates with a key, a missing key. The description is the integration's,
 * for the person who gave them.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidConnection extends Schema.TaggedError<InvalidConnection>()(
  "ConnectionService.InvalidConnection",
  { description: Schema.String },
) {}

/**
 * The connection authenticates with nothing, so it takes no key.
 *
 * @category errors
 * @since 0.1.0
 */
export class Keyless extends Schema.TaggedError<Keyless>()("ConnectionService.Keyless", {
  connectionId: Connection.Id,
}) {}

/**
 * This host keeps no credentials, so no connection that authenticates with a key can be used.
 *
 * @category errors
 * @since 0.1.0
 */
export class CredentialsUnavailable extends Schema.TaggedError<CredentialsUnavailable>()(
  "ConnectionService.CredentialsUnavailable",
  { reason: Schema.String },
) {}

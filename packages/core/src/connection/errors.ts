import { ConnectionImplementation } from "@amends/connection";
import { Schema } from "effect";
import { Connection } from "./connection.ts";

/** The outcomes `ConnectionApplication` reports that a caller can act on; schemas only. */

/** Missing, removed, and unreadable connections share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("ConnectionApplication.NotFound", {
  connectionId: Connection.Id,
}) {}

/** The connection's name is no longer the one expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("ConnectionApplication.Changed", {
  connectionId: Connection.Id,
}) {}

/** This host has not installed the implementation. */
export class UnknownImplementation extends Schema.TaggedError<UnknownImplementation>()(
  "ConnectionApplication.UnknownImplementation",
  { implementationId: ConnectionImplementation.Id },
) {}

/** The settings do not match what the implementation declares. */
export class InvalidSettings extends Schema.TaggedError<InvalidSettings>()(
  "ConnectionApplication.InvalidSettings",
  { issues: Schema.Array(Schema.String) },
) {}

/** The implementation does not authenticate this way, or the connection takes no credential. */
export class UnsupportedAuthentication extends Schema.TaggedError<UnsupportedAuthentication>()(
  "ConnectionApplication.UnsupportedAuthentication",
  { implementationId: ConnectionImplementation.Id, method: Connection.Method },
) {}

/** This host cannot store credentials, so none can be set. */
export class CredentialsUnavailable extends Schema.TaggedError<CredentialsUnavailable>()(
  "ConnectionApplication.CredentialsUnavailable",
  { reason: Schema.String },
) {}

export * as ConnectionErrors from "./errors.ts";

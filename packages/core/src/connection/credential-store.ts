import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { Connection } from "./connection.ts";

export class Failure extends Schema.TaggedError<Failure>()("ConnectionCredentialStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ConnectionCredentialStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}
/** This host keeps no credentials, such as when it has no key to protect them with. */
export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "ConnectionCredentialStore.Unavailable",
  { reason: Schema.String },
) {}

/** A stored credential, for the connection it belongs to. */
export interface Credential {
  readonly id: Connection.CredentialId;
  readonly connectionId: Connection.Id;
  readonly secret: Connection.Secret;
}

/**
 * Protected storage for connections' secrets, outside the journal: facts carry only references,
 * so replay, the change feed, and read models never hold a secret. Writes join the commit that
 * records them, so a credential and its reference are stored together or not at all. An adapter
 * protects secrets at rest as its storage allows; reads return them only to the server.
 */
export interface Interface {
  /** Store a new credential; reusing an ID conflicts. */
  readonly put: (
    credential: Credential,
  ) => Effect.Effect<void, Failure | Conflict | Unavailable, Store.Transaction>;
  /** A credential by ID, for using its connection. No application operation returns one. */
  readonly get: (
    id: Connection.CredentialId,
  ) => Effect.Effect<Option.Option<Credential>, Failure | Unavailable>;
  /** Delete a credential; one already gone is left so. */
  readonly remove: (id: Connection.CredentialId) => Effect.Effect<void, Failure, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/connection/credential-store/Service",
) {}

export * as ConnectionCredentialStore from "./credential-store.ts";

import type { Connection as ConnectionContract } from "@amends/connection";
import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { Connection } from "./connection.ts";

export class Failure extends Schema.TaggedError<Failure>()("ConnectionCredentialStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
/** This host keeps no credentials, as when it has no key to protect them with. */
export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "ConnectionCredentialStore.Unavailable",
  { reason: Schema.String },
) {}

/**
 * Protected storage for connections' credentials, one for each connection that authenticates with
 * one, outside the journal: no fact, read model, or view holds a secret, and rebuilding projections
 * keeps them. Writes join the commit that records them, so a connection and its credential are
 * stored together or not at all. An adapter protects credentials at rest as its storage allows,
 * bound to the connection they belong to; reads return them only to the server.
 */
export interface Interface {
  /** Store the connection's credential, in place of any it had. */
  readonly set: (
    connectionId: Connection.Id,
    credential: ConnectionContract.Credential,
  ) => Effect.Effect<void, Failure | Unavailable, Store.Transaction>;
  /** The connection's credential, for using it. No operation returns one to a reader. */
  readonly get: (
    connectionId: Connection.Id,
  ) => Effect.Effect<Option.Option<ConnectionContract.Credential>, Failure | Unavailable>;
  /** Delete the connection's credential; one already gone is left so. */
  readonly remove: (connectionId: Connection.Id) => Effect.Effect<void, Failure, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/connection/credential-store/Service",
) {}

export * as ConnectionCredentialStore from "./credential-store.ts";

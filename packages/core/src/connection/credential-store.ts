import { Connection as ConnectionContract } from "@amends-dev/connection";
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type { Store } from "../journal/store.ts";

import { Connection } from "./connection.ts";
import { StoreInput } from "../journal/StoreInput.ts";

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
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
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
  "@amends-dev/core/connection/credential-store/Service",
) {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (driver: Interface): Interface => {
  const read = StoreInput.read(Failure);
  return {
    set: Effect.fn("ConnectionCredentialStore.set")(function* (connectionId, credential) {
      return yield* driver.set(
        yield* read("set", Connection.Id, connectionId),
        yield* read("set", ConnectionContract.Credential, credential),
      );
    }),
    get: (connectionId) => Effect.flatMap(read("get", Connection.Id, connectionId), driver.get),
    remove: (connectionId) =>
      Effect.flatMap(read("remove", Connection.Id, connectionId), driver.remove),
  };
};

export * as ConnectionCredentialStore from "./credential-store.ts";

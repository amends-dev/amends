/**
 * The memory implementation of `ConnectionCredentialStore` from
 * `../connection/ConnectionCredentialStore.ts`, over the workspace's `Binding`. Each connection's
 * credential is kept beside the projected records, outside the journal, so rebuilding projections
 * keeps it; writes require the caller's transaction. A credential is stored as JSON, its key as it
 * is, unprotected, so this store is for tests and development. `ConnectionCredentialStore.make`
 * checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Connection } from "@amends-dev/connection";
import { ConnectionCredentialStore } from "../connection/index.ts";
import { Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

/** A credential as JSON, its key as it is: this adapter is for tests. */
const rows = Rows.make(Schema.fromJsonString(Schema.toCodecJson(Connection.Credential)));

/**
 * Each connection's credential in the workspace's memory, written in its transactions.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ConnectionCredentials.make")(function* () {
  const { read, write } = yield* Binding.Binding;
  const driver: ConnectionCredentialStore.ConnectionCredentialStore["Service"] = {
    set: Effect.fn("ConnectionCredentials.set")(
      function* (connectionId, credential) {
        const row = yield* rows.encode(credential);
        (yield* write).connectionCredentials.set(connectionId, row);
      },
      Effect.mapError(storeFailure(ConnectionCredentialStore, "set")),
    ),
    get: Effect.fn("ConnectionCredentials.get")(
      function* (connectionId) {
        return yield* rows.get((yield* read).connectionCredentials, connectionId);
      },
      Effect.mapError(storeFailure(ConnectionCredentialStore, "get")),
    ),
    remove: Effect.fn("ConnectionCredentials.remove")(
      function* (connectionId) {
        (yield* write).connectionCredentials.delete(connectionId);
      },
      Effect.mapError(storeFailure(ConnectionCredentialStore, "remove")),
    ),
  };
  return ConnectionCredentialStore.make(driver);
});

/**
 * Provide credential storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ConnectionCredentialStore.ConnectionCredentialStore, make());

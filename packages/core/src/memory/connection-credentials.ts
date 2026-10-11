import { Connection } from "@amends-dev/connection";
import { ConnectionCredentialStore } from "../connection/index.ts";
import { Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

/** A credential as JSON, its key as it is: this adapter is for tests. */
const rows = Rows.make(Schema.fromJsonString(Schema.toCodecJson(Connection.Credential)));

/** Each connection's credential in the workspace's memory, written in its transactions. @category constructors */
export const make = Effect.fn("ConnectionCredentials.make")(function* () {
  const { read, write } = yield* Binding.Service;
  const driver: ConnectionCredentialStore.Interface = {
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

/** Provide credential storage over the caller's binding. @category layers */
export const layer = Layer.effect(ConnectionCredentialStore.Service, make());

export * as ConnectionCredentials from "./connection-credentials.ts";

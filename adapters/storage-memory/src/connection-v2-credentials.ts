import { Connection } from "@amends/connection-v2";
import { ConnectionV2CredentialStore } from "@amends/core/connection-v2";
import { Store } from "@amends/core/journal";
import { Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

/** A credential as JSON, its key as it is: this adapter is for tests. */
const rows = Rows.make(Schema.fromJsonString(Schema.toCodecJson(Connection.Credential)));

/** Each connection's credential in the workspace's memory, written in its transactions. @category constructors */
export const make = Effect.fn("ConnectionV2Credentials.make")(function* () {
  const { read, write } = yield* Binding.Service;
  return ConnectionV2CredentialStore.Service.of({
    set: Effect.fn("ConnectionV2Credentials.set")(
      function* (connectionId, credential) {
        yield* Store.Transaction;
        const row = yield* rows.encode(credential);
        (yield* write).connectionV2Credentials.set(connectionId, row);
      },
      Effect.mapError(storeFailure(ConnectionV2CredentialStore, "set")),
    ),
    get: Effect.fn("ConnectionV2Credentials.get")(
      function* (connectionId) {
        return yield* rows.get((yield* read).connectionV2Credentials, connectionId);
      },
      Effect.mapError(storeFailure(ConnectionV2CredentialStore, "get")),
    ),
    remove: Effect.fn("ConnectionV2Credentials.remove")(
      function* (connectionId) {
        yield* Store.Transaction;
        (yield* write).connectionV2Credentials.delete(connectionId);
      },
      Effect.mapError(storeFailure(ConnectionV2CredentialStore, "remove")),
    ),
  });
});

/** Provide credential storage over the caller's binding. @category layers */
export const layer = Layer.effect(ConnectionV2CredentialStore.Service, make());

export * as ConnectionV2Credentials from "./connection-v2-credentials.ts";

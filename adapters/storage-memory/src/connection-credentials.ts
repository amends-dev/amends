import { Connection, ConnectionCredentialStore } from "@amends/core/connection";
import { Store } from "@amends/core/journal";
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

/** A stored credential. Memory holds it as it is: this adapter is for tests. */
const Row = Schema.Struct({
  id: Connection.CredentialId,
  connectionId: Connection.Id,
  secret: Schema.String,
});
const rows = Rows.make(Schema.fromJsonString(Row));

/** Credentials in the workspace's memory, written in its transactions. @category constructors */
export const make = Effect.fn("ConnectionCredentials.make")(function* () {
  const { read, write } = yield* Binding.Service;
  return ConnectionCredentialStore.Service.of({
    put: Effect.fn("ConnectionCredentials.put")(function* (credential) {
      yield* Store.Transaction;
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(ConnectionCredentialStore, "put")),
      );
      if (space.credentials.has(credential.id))
        return yield* new ConnectionCredentialStore.Conflict({
          operation: "put",
          message: "Credential ID already exists",
        });
      const row = yield* rows
        .encode({
          id: credential.id,
          connectionId: credential.connectionId,
          secret: Redacted.value(credential.secret),
        })
        .pipe(Effect.mapError(storeFailure(ConnectionCredentialStore, "put")));
      space.credentials.set(credential.id, row);
    }),
    get: Effect.fn("ConnectionCredentials.get")(
      function* (id) {
        const found = yield* rows.get((yield* read).credentials, id);
        return Option.map(found, (row) => ({
          id: row.id,
          connectionId: row.connectionId,
          secret: Redacted.make(row.secret),
        }));
      },
      Effect.mapError(storeFailure(ConnectionCredentialStore, "get")),
    ),
    remove: Effect.fn("ConnectionCredentials.remove")(
      function* (id) {
        yield* Store.Transaction;
        (yield* write).credentials.delete(id);
      },
      Effect.mapError(storeFailure(ConnectionCredentialStore, "remove")),
    ),
  });
});

/** Provide credential storage over the caller's binding. @category layers */
export const layer = Layer.effect(ConnectionCredentialStore.Service, make());

export * as ConnectionCredentials from "./connection-credentials.ts";

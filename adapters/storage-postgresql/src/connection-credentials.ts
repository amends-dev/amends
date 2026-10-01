import { Connection, ConnectionCredentialStore } from "@amends/core/connection";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Option, Redacted, Schema } from "effect";
import { Binding } from "./binding.ts";
import { CredentialKey } from "./credential-key.ts";
import { storeError, storeFailure } from "./errors.ts";
import { connectionCredentials } from "./schema.ts";

const unavailable = new ConnectionCredentialStore.Unavailable({
  reason: "This host has no credential key, so it stores no credentials.",
});
const decodeRow = Schema.decodeUnknownEffect(
  Schema.Struct({
    id: Connection.CredentialId,
    connectionId: Connection.Id,
    sealed: Schema.String,
  }),
);

/**
 * Credentials sealed with the host's credential key, in the workspace's database; writes join
 * the commit that records them. Without a key, storing or reading one is `Unavailable`.
 *
 * @category constructors
 */
export const make = Effect.fn("ConnectionCredentials.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const credentialKey = yield* CredentialKey.Service;
  const { db } = database;
  /** What each sealed value is bound to: its workspace, its ID, and its connection. */
  const bindingOf = (id: string, connectionId: string) =>
    JSON.stringify([workspaceId, id, connectionId]);
  const inWorkspace = (id: Connection.CredentialId) =>
    and(eq(connectionCredentials.workspaceId, workspaceId), eq(connectionCredentials.id, id));
  return ConnectionCredentialStore.Service.of({
    put: Effect.fn("ConnectionCredentials.put")(function* (credential) {
      yield* Store.Transaction;
      if (Option.isNone(credentialKey)) return yield* unavailable;
      const sealed = yield* credentialKey.value
        .seal(Redacted.value(credential.secret), bindingOf(credential.id, credential.connectionId))
        .pipe(Effect.mapError(storeFailure(ConnectionCredentialStore, "put")));
      yield* guard(
        db.insert(connectionCredentials).values({
          workspaceId,
          id: credential.id,
          connectionId: credential.connectionId,
          sealed,
        }),
        true,
      ).pipe(Effect.mapError(storeError(ConnectionCredentialStore, "put")));
    }),
    get: Effect.fn("ConnectionCredentials.get")(function* (id) {
      if (Option.isNone(credentialKey)) return yield* unavailable;
      const rows = yield* guard(
        db.select().from(connectionCredentials).where(inWorkspace(id)),
      ).pipe(Effect.mapError(storeFailure(ConnectionCredentialStore, "get")));
      const found = Array.head(rows);
      if (Option.isNone(found)) return Option.none();
      const row = yield* decodeRow(found.value).pipe(
        Effect.mapError(storeFailure(ConnectionCredentialStore, "get")),
      );
      const secret = yield* credentialKey.value
        .open(row.sealed, bindingOf(row.id, row.connectionId))
        .pipe(Effect.mapError(storeFailure(ConnectionCredentialStore, "get")));
      return Option.some({
        id: row.id,
        connectionId: row.connectionId,
        secret: Redacted.make(secret),
      });
    }),
    remove: Effect.fn("ConnectionCredentials.remove")(function* (id) {
      yield* Store.Transaction;
      yield* guard(db.delete(connectionCredentials).where(inWorkspace(id)), true).pipe(
        Effect.mapError(storeFailure(ConnectionCredentialStore, "remove")),
      );
    }),
  });
});

/** Provide credential storage over the caller's binding and credential key. @category layers */
export const layer = Layer.effect(ConnectionCredentialStore.Service, make());

export * as ConnectionCredentials from "./connection-credentials.ts";

import { Connection } from "@amends-dev/connection";
import { ConnectionCredentialStore } from "@amends-dev/core/connection";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import * as CredentialKey from "./CredentialKey.ts";
import { storeFailure } from "./internal/errors.ts";
import { connectionCredentials } from "./internal/schema.ts";

const unavailable = new ConnectionCredentialStore.Unavailable({
  reason: "This host has no credential key, so it stores no credentials.",
});
/** A credential as the JSON that is sealed. */
const CredentialJson = Schema.fromJsonString(Schema.toCodecJson(Connection.Credential));
const encodeCredential = Schema.encodeEffect(CredentialJson);
const decodeCredential = Schema.decodeEffect(CredentialJson);

/**
 * Each connection's credential sealed with the host's credential key, in the workspace's database;
 * writes join the commit that records them. Without a key, storing or reading one is `Unavailable`.
 *
 * @category constructors
 */
export const make = Effect.fn("ConnectionCredentials.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const credentialKey = yield* CredentialKey.CredentialKey;
  const { db } = database;
  /** What each sealed credential is bound to: its workspace and its connection. */
  const bindingOf = (connectionId: string) => JSON.stringify([workspaceId, connectionId]);
  const ofConnection = (connectionId: string) =>
    and(
      eq(connectionCredentials.workspaceId, workspaceId),
      eq(connectionCredentials.connectionId, connectionId),
    );
  const driver: ConnectionCredentialStore.ConnectionCredentialStore["Service"] = {
    set: Effect.fn("ConnectionCredentials.set")(function* (connectionId, credential) {
      if (Option.isNone(credentialKey)) return yield* unavailable;
      const sealed = yield* encodeCredential(credential).pipe(
        Effect.flatMap((json) => credentialKey.value.seal(json, bindingOf(connectionId))),
        Effect.mapError(storeFailure(ConnectionCredentialStore, "set")),
      );
      yield* guard(
        db
          .insert(connectionCredentials)
          .values({ workspaceId, connectionId, sealed })
          .onConflictDoUpdate({
            target: [connectionCredentials.workspaceId, connectionCredentials.connectionId],
            set: { sealed },
          }),
        true,
      ).pipe(Effect.mapError(storeFailure(ConnectionCredentialStore, "set")));
    }),
    get: Effect.fn("ConnectionCredentials.get")(function* (connectionId) {
      if (Option.isNone(credentialKey)) return yield* unavailable;
      const rows = yield* guard(
        db.select().from(connectionCredentials).where(ofConnection(connectionId)),
      ).pipe(Effect.mapError(storeFailure(ConnectionCredentialStore, "get")));
      const found = Array.head(rows);
      if (Option.isNone(found)) return Option.none();
      return yield* credentialKey.value
        .open(found.value.sealed, bindingOf(connectionId))
        .pipe(
          Effect.flatMap(decodeCredential),
          Effect.asSome,
          Effect.mapError(storeFailure(ConnectionCredentialStore, "get")),
        );
    }),
    remove: Effect.fn("ConnectionCredentials.remove")(function* (connectionId) {
      yield* guard(db.delete(connectionCredentials).where(ofConnection(connectionId)), true).pipe(
        Effect.mapError(storeFailure(ConnectionCredentialStore, "remove")),
      );
    }),
  };
  return ConnectionCredentialStore.make(driver);
});

/** Provide credential storage over the caller's binding and credential key. @category layers */
export const layer = Layer.effect(ConnectionCredentialStore.ConnectionCredentialStore, make());

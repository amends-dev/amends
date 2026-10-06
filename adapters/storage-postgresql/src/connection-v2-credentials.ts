import { Connection } from "@amends/connection-v2";
import { ConnectionV2CredentialStore } from "@amends/core/connection-v2";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { CredentialKey } from "./credential-key.ts";
import { storeFailure } from "./errors.ts";
import { connectionV2Credentials } from "./schema.ts";

const unavailable = new ConnectionV2CredentialStore.Unavailable({
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
export const make = Effect.fn("ConnectionV2Credentials.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const credentialKey = yield* CredentialKey.Service;
  const { db } = database;
  /** What each sealed credential is bound to: its workspace and its connection. */
  const bindingOf = (connectionId: string) => JSON.stringify([workspaceId, connectionId]);
  const ofConnection = (connectionId: string) =>
    and(
      eq(connectionV2Credentials.workspaceId, workspaceId),
      eq(connectionV2Credentials.connectionId, connectionId),
    );
  return ConnectionV2CredentialStore.Service.of({
    set: Effect.fn("ConnectionV2Credentials.set")(function* (connectionId, credential) {
      yield* Store.Transaction;
      if (Option.isNone(credentialKey)) return yield* unavailable;
      const sealed = yield* encodeCredential(credential).pipe(
        Effect.flatMap((json) => credentialKey.value.seal(json, bindingOf(connectionId))),
        Effect.mapError(storeFailure(ConnectionV2CredentialStore, "set")),
      );
      yield* guard(
        db
          .insert(connectionV2Credentials)
          .values({ workspaceId, connectionId, sealed })
          .onConflictDoUpdate({
            target: [connectionV2Credentials.workspaceId, connectionV2Credentials.connectionId],
            set: { sealed },
          }),
        true,
      ).pipe(Effect.mapError(storeFailure(ConnectionV2CredentialStore, "set")));
    }),
    get: Effect.fn("ConnectionV2Credentials.get")(function* (connectionId) {
      if (Option.isNone(credentialKey)) return yield* unavailable;
      const rows = yield* guard(
        db.select().from(connectionV2Credentials).where(ofConnection(connectionId)),
      ).pipe(Effect.mapError(storeFailure(ConnectionV2CredentialStore, "get")));
      const found = Array.head(rows);
      if (Option.isNone(found)) return Option.none();
      return yield* credentialKey.value
        .open(found.value.sealed, bindingOf(connectionId))
        .pipe(
          Effect.flatMap(decodeCredential),
          Effect.asSome,
          Effect.mapError(storeFailure(ConnectionV2CredentialStore, "get")),
        );
    }),
    remove: Effect.fn("ConnectionV2Credentials.remove")(function* (connectionId) {
      yield* Store.Transaction;
      yield* guard(db.delete(connectionV2Credentials).where(ofConnection(connectionId)), true).pipe(
        Effect.mapError(storeFailure(ConnectionV2CredentialStore, "remove")),
      );
    }),
  });
});

/** Provide credential storage over the caller's binding and credential key. @category layers */
export const layer = Layer.effect(ConnectionV2CredentialStore.Service, make());

export * as ConnectionV2Credentials from "./connection-v2-credentials.ts";

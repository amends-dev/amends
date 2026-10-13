/**
 * The PostgreSQL driver for `ConnectionCredentialStore.ConnectionCredentialStore`, over the
 * `connection_credentials` table: each connection's credential, sealed with the host's
 * `CredentialKey.CredentialKey` and bound to its workspace and connection, so a sealed value opens
 * only as the credential it was stored as. The table lies outside the read models, so rebuilding
 * projections keeps it, and a write joins the commit that records the connection.
 * `ConnectionCredentialStore.make` checks every input before the driver sees it; `set` replaces a
 * connection's credential in place, and `remove` leaves one already gone so. Without a key,
 * setting or reading a credential is `Unavailable`. Every statement is scoped to the binding's
 * workspace and runs under its `guard`, which lets a read join the caller's transaction and
 * requires one for a write.
 *
 * @since 0.1.0
 */
import { Connection } from "@amends-dev/connection";
import { ConnectionCredentialStore } from "@amends-dev/core/connection";
import { and, eq } from "drizzle-orm";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Binding from "./Binding.ts";
import * as CredentialKey from "./CredentialKey.ts";

import { connectionCredentials } from "./internal/schema.ts";
import { CoreError } from "@amends-dev/core/error";
import { StoreError } from "@amends-dev/core/journal";

const unavailable = new CoreError.Unavailable({
  reason: new CoreError.CredentialsUnavailable({
    description: "This host has no credential key, so it stores no credentials.",
  }),
});
/** A credential as the JSON that is sealed. */
const CredentialJson = Schema.fromJsonString(Schema.toCodecJson(Connection.Credential));
const encodeCredential = Schema.encodeEffect(CredentialJson);
const decodeCredential = Schema.decodeEffect(CredentialJson);

/**
 * Builds the credential store for the binding's workspace: this module's driver inside
 * `ConnectionCredentialStore.make`, which checks every input first. Without a key, storing or
 * reading a credential is `Unavailable`.
 *
 * @category constructors
 * @since 0.1.0
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
        Effect.mapError(StoreError.failed("ConnectionCredentialStore", "set")),
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
      ).pipe(Effect.mapError(StoreError.failed("ConnectionCredentialStore", "set")));
    }),
    get: Effect.fn("ConnectionCredentials.get")(function* (connectionId) {
      if (Option.isNone(credentialKey)) return yield* unavailable;
      const rows = yield* guard(
        db.select().from(connectionCredentials).where(ofConnection(connectionId)),
      ).pipe(Effect.mapError(StoreError.failed("ConnectionCredentialStore", "get")));
      const found = Array.head(rows);
      if (Option.isNone(found)) return Option.none();
      return yield* credentialKey.value
        .open(found.value.sealed, bindingOf(connectionId))
        .pipe(
          Effect.flatMap(decodeCredential),
          Effect.asSome,
          Effect.mapError(StoreError.failed("ConnectionCredentialStore", "get")),
        );
    }),
    remove: Effect.fn("ConnectionCredentials.remove")(function* (connectionId) {
      yield* guard(db.delete(connectionCredentials).where(ofConnection(connectionId)), true).pipe(
        Effect.mapError(StoreError.failed("ConnectionCredentialStore", "remove")),
      );
    }),
  };
  return ConnectionCredentialStore.make(driver);
});

/**
 * Provides `ConnectionCredentialStore.ConnectionCredentialStore` over the caller's
 * `Binding.Binding` and `CredentialKey.CredentialKey`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ConnectionCredentialStore.ConnectionCredentialStore, make());

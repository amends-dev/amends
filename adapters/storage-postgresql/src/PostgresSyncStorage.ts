/**
 * The sync server's storage in PostgreSQL: the remote ID in `sync_server`, a table of one row that
 * the first host to read it inserts, and the keys in `sync_keys`. Each change to a key is one
 * statement, so concurrent hosts register and bind it one at a time.
 *
 * @since 0.1.0
 */

import { Identity } from "@amends-dev/core/identity"
import { SyncStorage } from "@amends-dev/gateway"
import { and, eq, sql } from "drizzle-orm"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { syncKeys, syncServer } from "./internal/schema.ts"
import * as PostgresDatabase from "./PostgresDatabase.ts"

/**
 * Build the sync storage over the host's database.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const { db } = yield* PostgresDatabase.PostgresDatabase
  const crypto = yield* Crypto.Crypto
  return SyncStorage.SyncStorage.of({
    remoteId: Effect.gen(function* () {
      const made = yield* crypto.randomUUIDv4({ format: "bytes" })
      yield* db.insert(syncServer).values({ remoteId: made }).onConflictDoNothing()
      const [row] = yield* db.select({ remoteId: syncServer.remoteId }).from(syncServer)
      if (row === undefined) return yield* Effect.die("The sync server's row is missing.")
      return EventJournal.RemoteId.make(new Uint8Array(row.remoteId))
    }).pipe(Effect.orDie),
    registerKey: Effect.fn("PostgresSyncStorage.registerKey")(function* (publicKey, humanId) {
      // Setting the person to itself on conflict makes the statement return the registered one.
      const [row] = yield* db
        .insert(syncKeys)
        .values({ publicKey, humanId })
        .onConflictDoUpdate({ target: syncKeys.publicKey, set: { humanId: sql`${syncKeys.humanId}` } })
        .returning({ humanId: syncKeys.humanId })
        .pipe(Effect.orDie)
      if (row === undefined) return yield* Effect.die("The key insert returned no row.")
      if (row.humanId !== humanId) return yield* new SyncStorage.KeyTaken()
    }),
    removeKey: Effect.fn("PostgresSyncStorage.removeKey")(function* (publicKey, humanId) {
      yield* db.delete(syncKeys).where(and(eq(syncKeys.publicKey, publicKey), eq(syncKeys.humanId, humanId)))
    }, Effect.orDie),
    personOf: Effect.fn("PostgresSyncStorage.personOf")(function* (publicKey) {
      const [row] = yield* db
        .select({ humanId: syncKeys.humanId })
        .from(syncKeys)
        .where(eq(syncKeys.publicKey, publicKey))
      return row === undefined ? Option.none() : Option.some(Identity.HumanId.make(row.humanId))
    }, Effect.orDie),
    bindSigningKey: Effect.fn("PostgresSyncStorage.bindSigningKey")(function* (publicKey, signingPublicKey) {
      const [row] = yield* db
        .update(syncKeys)
        .set({ signingPublicKey: sql`COALESCE(${syncKeys.signingPublicKey}, ${signingPublicKey})` })
        .where(eq(syncKeys.publicKey, publicKey))
        .returning({ signingPublicKey: syncKeys.signingPublicKey })
      if (row === undefined || row.signingPublicKey === null) return Option.none()
      return Option.some(new Uint8Array(row.signingPublicKey))
    }, Effect.orDie)
  })
})

/**
 * Provide the sync storage over the host's database.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(SyncStorage.SyncStorage, make)

/**
 * Where the sync server keeps what every host serving it shares: the remote ID browsers know it
 * by, and the keys people registered for their browsers, each with the signing key it first
 * authenticated with. A browser makes its own eventlog identity, and its person registers the
 * identity's public key through the HTTP API, signed in; `SyncServer` then opens that person's
 * stores to whoever proves they hold it. Storage adapters implement it, `layerMemory` in process
 * memory, and the `syncStorage` conformance suite checks that every host sees one remote ID, and
 * one person and one signing key for each key.
 *
 * @since 0.1.0
 */

import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/**
 * The public key of a browser's eventlog identity: a UUID, as `EventLog.makeIdentity` makes it.
 * It names the identity; the identity's signing key is what proves a browser holds it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PublicKey = Schema.String.check(Schema.isUUID())

/**
 * The key is registered for another person; nothing changed.
 *
 * @category errors
 * @since 0.1.0
 */
export class KeyTaken extends Schema.TaggedError<KeyTaken>()("SyncStorage.KeyTaken", {}) {}

/**
 * What the sync server keeps across hosts. Storage failures are defects.
 *
 * @category services
 * @since 0.1.0
 */
export class SyncStorage extends Context.Service<
  SyncStorage,
  {
    /**
     * How every browser knows the sync server over this storage, made with the storage the first
     * time it is read and never changed, so it changes only when the storage is made anew and
     * positions could repeat.
     */
    readonly remoteId: Effect.Effect<EventJournal.RemoteId>
    /** Register `publicKey` for the person `humanId`; registering it for them again changes nothing. */
    readonly registerKey: (publicKey: string, humanId: Identity.HumanId) => Effect.Effect<void, KeyTaken>
    /** Remove `publicKey`, with the signing key it was bound to, when it is registered for `humanId`. */
    readonly removeKey: (publicKey: string, humanId: Identity.HumanId) => Effect.Effect<void>
    /** The person `publicKey` is registered for, if any. */
    readonly personOf: (publicKey: string) => Effect.Effect<Option.Option<Identity.HumanId>>
    /**
     * The signing key `publicKey` is bound to, binding it to `signingPublicKey` when it never was;
     * none when the key is not registered. The first binding holds, whichever host made it.
     */
    readonly bindSigningKey: (
      publicKey: string,
      signingPublicKey: Uint8Array<ArrayBuffer>
    ) => Effect.Effect<Option.Option<Uint8Array<ArrayBuffer>>>
  }
>()("@amends-dev/gateway/SyncStorage") {}

/** A registered key as the memory storage holds it. */
const Registration = Schema.Struct({
  humanId: Identity.HumanId,
  signingPublicKey: Schema.optionalKey(Schema.Uint8Array)
})
const registrationRows = MemoryDatabase.makeRows(Schema.fromJsonString(Schema.toCodecJson(Registration)))
const remoteIdRows = MemoryDatabase.makeRows(Schema.fromJsonString(Schema.toCodecJson(EventJournal.RemoteId)))

/**
 * The remote ID and the keys in two tables of `MemoryDatabase`, shared by every host over it. A
 * change to a key holds the key's lock, so changes to it apply one at a time across every host.
 */
const makeMemory = Effect.fn("SyncStorage.makeMemory")(function* () {
  const database = yield* MemoryDatabase.MemoryDatabase
  const syncServer = MemoryDatabase.table(database, "sync_server")
  const syncKeys = MemoryDatabase.table(database, "sync_keys")
  const crypto = yield* Crypto.Crypto
  const withKey = (publicKey: string) => MemoryDatabase.lock(database, MemoryDatabase.keyOf("sync-key", publicKey))
  return SyncStorage.of({
    remoteId: Effect.gen(function* () {
      const made = yield* remoteIdRows.encode(
        EventJournal.RemoteId.make(yield* crypto.randomUUIDv4({ format: "bytes" }))
      )
      // The first host to read it stores the one it made; every later read finds that one.
      const stored = syncServer.get("remote-id") ?? made
      syncServer.set("remote-id", stored)
      return yield* remoteIdRows.decode(stored)
    }).pipe(Effect.orDie),
    registerKey: (publicKey, humanId) =>
      withKey(publicKey)
        .withPermit(
          Effect.gen(function* () {
            const found = yield* registrationRows.get(syncKeys, publicKey).pipe(Effect.orDie)
            if (Option.isNone(found))
              return syncKeys.set(publicKey, yield* registrationRows.encode({ humanId }).pipe(Effect.orDie))
            if (found.value.humanId !== humanId) return yield* new KeyTaken()
          })
        )
        .pipe(Effect.asVoid),
    removeKey: (publicKey, humanId) =>
      withKey(publicKey)
        .withPermit(
          Effect.gen(function* () {
            const found = yield* registrationRows.get(syncKeys, publicKey)
            if (Option.isSome(found) && found.value.humanId === humanId) syncKeys.delete(publicKey)
          })
        )
        .pipe(Effect.orDie),
    personOf: (publicKey) =>
      registrationRows
        .get(syncKeys, publicKey)
        .pipe(Effect.map(Option.map((registration) => registration.humanId)), Effect.orDie),
    bindSigningKey: (publicKey, signingPublicKey) =>
      withKey(publicKey)
        .withPermit(
          Effect.gen(function* () {
            const found = yield* registrationRows.get(syncKeys, publicKey)
            if (Option.isNone(found)) return Option.none()
            if (found.value.signingPublicKey !== undefined)
              return Option.some(new Uint8Array(found.value.signingPublicKey))
            syncKeys.set(publicKey, yield* registrationRows.encode({ ...found.value, signingPublicKey }))
            return Option.some(signingPublicKey)
          })
        )
        .pipe(Effect.orDie)
  })
})

/**
 * Provide sync storage in process memory, over the `MemoryDatabase` and `Crypto.Crypto` beneath:
 * the remote ID and the keys in two of its tables, shared by every host over the same database. A
 * new database is new storage, with a new remote ID.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(SyncStorage, makeMemory())

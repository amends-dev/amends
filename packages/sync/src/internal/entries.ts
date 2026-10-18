/**
 * A replica's batch as the entry a member's store holds: `ReplicaChanged`, at the batch's position
 * as its sequence, under an ID derived from the store and the batch, so a batch sent again is
 * the same entry.
 */

import type { ReplicaChange } from "@amends-dev/core/replica"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as SchemaBinary from "effect/encoding/SchemaBinary"
import * as EventJournal from "effect/eventlog/EventJournal"
import type * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as Schema from "effect/Schema"
import * as ReplicaSync from "../ReplicaSync.ts"

// The group defines it.
const replicaChanged = ReplicaSync.Changes.events.ReplicaChanged!
const encodePayload = Schema.encodeEffect(replicaChanged.payloadSchemaBinary)
/** What names a member's store and one batch in it, as bytes to digest. */
const encodeName = Schema.encodeEffect(
  SchemaBinary.toCodec(Schema.Tuple([Schema.Uint8Array, Schema.String, Schema.String, Schema.Int]))
)

/** Whose store an entry is in: the server's, and the member's identity and workspace in it. */
export interface Store {
  readonly remoteId: EventJournal.RemoteId
  readonly publicKey: string
  readonly storeId: EventLogMessage.StoreId
}

/**
 * The ID of the entry carrying `batch` in `store`: a version 7 UUID of when its commit was
 * recorded, the rest of it digested from the store and the batch's position.
 */
const entryIdOf = Effect.fnUntraced(function* (store: Store, batch: ReplicaChange.Batch) {
  const crypto = yield* Crypto.Crypto
  const digest = yield* crypto.digest(
    "SHA-256",
    yield* encodeName([store.remoteId, store.publicKey, store.storeId, batch.position])
  )
  const id = new Uint8Array(16)
  const millis = DateTime.toEpochMillis(batch.recordedAt)
  for (let index = 0; index < 6; index++) id[index] = Math.floor(millis / 2 ** (8 * (5 - index))) % 256
  id.set(digest.subarray(0, 10), 6)
  id[6] = 0x70 | ((id[6] ?? 0) & 0x0f)
  id[8] = 0x80 | ((id[8] ?? 0) & 0x3f)
  return id as EventJournal.EntryId
})

/** `batch` as the entry `store` holds at its position. */
export const remoteEntryOf = Effect.fnUntraced(function* (store: Store, batch: ReplicaChange.Batch) {
  return new EventJournal.RemoteEntry({
    remoteSequence: batch.position,
    entry: new EventJournal.Entry({
      id: yield* entryIdOf(store, batch),
      event: replicaChanged.tag,
      primaryKey: replicaChanged.primaryKey(batch),
      payload: yield* encodePayload(batch)
    })
  })
})

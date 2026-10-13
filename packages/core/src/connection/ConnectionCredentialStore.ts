/**
 * The storage contract for connections' credentials, each the key a connection authenticates with,
 * which every storage adapter implements and keeps outside the journal. `ConnectionService` stores
 * a connection's key in the commit that records the connection, replaces it, reads it to check the
 * connection, and deletes it on removal; `AgentQuery` and `ChannelQuery` read it to give what runs
 * on a connection its key. A host that keeps no credentials reports `Unavailable`.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as CoreError from "../error/CoreError.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Store from "../journal/Store.ts"
import * as StoreError from "../journal/StoreError.ts"
import * as StoreInput from "../journal/StoreInput.ts"
import * as Connection from "./Connection.ts"

/**
 * Protected storage for connections' credentials, one for each connection that authenticates with
 * one, outside the journal: no fact, read model, or view holds a secret, and rebuilding projections
 * keeps them. Writes join the commit that records them, so a connection and its credential are
 * stored together or not at all. An adapter protects credentials at rest as its storage allows,
 * bound to the connection they belong to; reads return them only to the server.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema before the driver sees it, so a driver keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ConnectionCredentialStore extends Context.Service<
  ConnectionCredentialStore,
  {
    /** Store the connection's credential, in place of any it had. */
    readonly set: (
      connectionId: Connection.Id,
      credential: ConnectionContract.Credential
    ) => Effect.Effect<void, StoreError.StoreError | CoreError.Unavailable, Store.Transaction>
    /** The connection's credential, for using it. No operation returns one to a reader. */
    readonly get: (
      connectionId: Connection.Id
    ) => Effect.Effect<Option.Option<ConnectionContract.Credential>, StoreError.StoreError | CoreError.Unavailable>
    /** Delete the connection's credential; one already gone is left so. */
    readonly remove: (connectionId: Connection.Id) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/connection/ConnectionCredentialStore") {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (driver: ConnectionCredentialStore["Service"]): ConnectionCredentialStore["Service"] => {
  const read = StoreInput.read("ConnectionCredentialStore")
  return {
    set: Effect.fn("ConnectionCredentialStore.set")(function* (connectionId, credential) {
      return yield* driver.set(
        yield* read("set", Connection.Id, connectionId),
        yield* read("set", ConnectionContract.Credential, credential)
      )
    }),
    get: (connectionId) => Effect.flatMap(read("get", Connection.Id, connectionId), driver.get),
    remove: (connectionId) => Effect.flatMap(read("remove", Connection.Id, connectionId), driver.remove)
  }
}

/** A credential as JSON, its key as it is: this adapter is for tests. */
const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Schema.toCodecJson(ConnectionContract.Credential)))

/**
 * Each connection's credential in the workspace's memory, written in its transactions.
 */
const makeMemory = Effect.fn("ConnectionCredentialStore.makeMemory")(function* () {
  const { read, write } = yield* Store.MemoryBinding
  const driver: ConnectionCredentialStore["Service"] = {
    set: Effect.fn("ConnectionCredentialStore.memory.set")(
      function* (connectionId, credential) {
        const row = yield* rows.encode(credential)
        ;(yield* write).connectionCredentials.set(connectionId, row)
      },
      Effect.mapError(StoreError.failed("ConnectionCredentialStore", "set"))
    ),
    get: Effect.fn("ConnectionCredentialStore.memory.get")(
      function* (connectionId) {
        return yield* rows.get((yield* read).connectionCredentials, connectionId)
      },
      Effect.mapError(StoreError.failed("ConnectionCredentialStore", "get"))
    ),
    remove: Effect.fn("ConnectionCredentialStore.memory.remove")(
      function* (connectionId) {
        ;(yield* write).connectionCredentials.delete(connectionId)
      },
      Effect.mapError(StoreError.failed("ConnectionCredentialStore", "remove"))
    )
  }
  return make(driver)
})

/**
 * Provide `ConnectionCredentialStore` in process memory, over the workspace's
 * `Store.MemoryBinding`. Each connection's credential is kept beside the projected records, outside
 * the journal, so rebuilding projections keeps it; writes require the caller's transaction. A
 * credential is stored as JSON, its key as it is, unprotected, so this store is for tests and
 * development. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ConnectionCredentialStore, makeMemory())

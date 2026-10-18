/**
 * A store open in the browser: one person's of one workspace, as eventlog keeps it, and the replica
 * its changes keep. Its event log journals into an IndexedDB database of its own and applies each
 * `ReplicaChanged` to the replica. The host's sync server is its remote, reached in the background
 * once the browser's sync key is registered, and tried again until it is, so a store opens, and its
 * replica reads, offline. A store's databases are named for the host, the person, and the
 * workspace, since positions and entry IDs are only unique within one store.
 */

import type { Identity } from "@amends-dev/core/identity"
import type { WorkspaceId } from "@amends-dev/core/workspace"
import * as ReplicaSync from "@amends-dev/sync/ReplicaSync"
import * as SyncClient from "@amends-dev/sync/SyncClient"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as Api from "../api.ts"
import * as Replica from "./Replica.ts"
import * as SyncKey from "./SyncKey.ts"

/** Whose store to open, of which workspace, on which host, and the session that registers its key. */
export interface Options {
  readonly apiUrl: string
  readonly token: string
  readonly humanId: Identity.HumanId
  readonly workspaceId: WorkspaceId.WorkspaceId
}

/**
 * A store, open for as long as the scope that opened it.
 */
export class Store extends Context.Service<
  Store,
  {
    /**
     * How many records of each kind the replica holds, and again after each commit it applies.
     * It fails when the replica cannot be read, or a commit cannot be written to it.
     */
    readonly counts: Stream.Stream<Replica.Counts, IndexedDbQueryBuilder.IndexedDbQueryError>
  }
>()("@amends-dev/app-v2/sync/Store") {}

/** What the browser's event log holds: the changes the server writes back. */
const schema = EventLog.schema(ReplicaSync.Changes)

/** The prefix of every database the person's stores keep on the host at `apiUrl`. */
const databasePrefix = (apiUrl: string, humanId: Identity.HumanId) => `amends/${apiUrl}/${humanId}/`

/**
 * Apply each `ReplicaChanged` to the replica. Eventlog logs a handler's failure and records the
 * entry anyway, so a failure completes `failed` instead, which ends the store's reads.
 */
const layerReplicaChanges = (failed: Deferred.Deferred<never, IndexedDbQueryBuilder.IndexedDbQueryError>) =>
  EventLog.group(ReplicaSync.Changes, (handlers) =>
    handlers.handle("ReplicaChanged", ({ payload }) =>
      Effect.flatMap(Replica.Replica, (replica) => replica.apply(payload)).pipe(
        Effect.catch((error) => Effect.asVoid(Deferred.fail(failed, error)))
      )
    )
  )

/** As often as eventlog tries a remote again: quickly at first, then every ten seconds. */
const reconnecting = Schedule.min([Schedule.exponential("200 millis", 1.5), Schedule.spaced("10 seconds")])

/**
 * Register the browser's key, then join the host's sync server as the event log's remote for as
 * long as the store is open, trying again until both succeed.
 */
const connect = (options: Options, identity: EventLog.Identity["Service"]) =>
  Effect.gen(function* () {
    const client = yield* Api.client(options.apiUrl, options.token)
    yield* client.me.registerSyncKey({ params: { publicKey: identity.publicKey } })
    yield* Layer.build(SyncClient.layer(options.apiUrl))
  }).pipe(
    Effect.tapCause((cause) => Effect.logWarning("The store could not reach its host", cause)),
    Effect.retry(reconnecting),
    Effect.andThen(Effect.never)
  )

/**
 * Open the store `options` names: its replica, its event log, and its remote in the background.
 *
 * @category layers
 */
export const layer = (options: Options) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const identity = yield* SyncKey.forPerson(options.apiUrl, options.humanId)
      const failed = yield* Deferred.make<never, IndexedDbQueryBuilder.IndexedDbQueryError>()
      const named = databasePrefix(options.apiUrl, options.humanId) + options.workspaceId
      const eventLog = EventLog.layer(schema, layerReplicaChanges(failed)).pipe(
        Layer.provide(EventJournal.layerIndexedDb({ database: `${named}/journal` })),
        Layer.provide(Layer.succeed(EventLog.Identity, identity)),
        Layer.provide(Layer.succeed(EventLog.CurrentStoreId, EventLogMessage.StoreId.make(options.workspaceId)))
      )
      const remote = Layer.effectDiscard(Effect.forkScoped(connect(options, identity)))
      const store = Layer.effect(
        Store,
        Effect.map(Replica.Replica, (replica) =>
          Store.of({ counts: Stream.interruptWhen(replica.counts, Deferred.await(failed)) })
        )
      )
      return Layer.mergeAll(store, remote).pipe(
        Layer.provide(eventLog),
        Layer.provide(Replica.layer(`${named}/replica`))
      )
    })
  )

/**
 * Delete every store the person kept on the host at `apiUrl`, and the identity they synced with,
 * as signing out does. A store still open is deleted once it closes.
 *
 * @category destructors
 */
export const forgetPerson = Effect.fnUntraced(function* (apiUrl: string, humanId: Identity.HumanId) {
  const { indexedDB } = yield* IndexedDb.IndexedDb
  const prefix = databasePrefix(apiUrl, humanId)
  const databases = yield* Effect.tryPromise(() => indexedDB.databases())
  for (const { name } of databases) if (name?.startsWith(prefix) === true) indexedDB.deleteDatabase(name)
  yield* SyncKey.forget(apiUrl, humanId)
})

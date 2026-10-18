/**
 * A store open in the browser: one person's of one workspace, as eventlog keeps it, and the replica
 * its changes keep. Its event log journals into an IndexedDB database of its own. The actions the
 * person writes, `write`, are held in the replica as pending, with what each is expected to create,
 * until the server runs them; each `ReplicaChanged` the server writes back is applied to the
 * replica. The host's sync server is the log's remote, reached in the background once the browser's
 * sync key is registered, and tried again until it is, so a store opens, reads, and takes actions
 * offline; eventlog sends what was written while it could not. A store's databases are named for
 * the host, the person, and the workspace, since positions and entry IDs are only unique within one.
 */

import type { Identity } from "@amends-dev/core/identity"
import { Request } from "@amends-dev/core/request"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as AgentSync from "@amends-dev/sync/AgentSync"
import * as ChannelSync from "@amends-dev/sync/ChannelSync"
import * as ConnectionSync from "@amends-dev/sync/ConnectionSync"
import * as GroupSync from "@amends-dev/sync/GroupSync"
import * as NotificationSync from "@amends-dev/sync/NotificationSync"
import * as ReplicaSync from "@amends-dev/sync/ReplicaSync"
import * as SyncClient from "@amends-dev/sync/SyncClient"
import * as SyncSchema from "@amends-dev/sync/SyncSchema"
import * as TaskSync from "@amends-dev/sync/TaskSync"
import * as ThreadSync from "@amends-dev/sync/ThreadSync"
import * as TurnSync from "@amends-dev/sync/TurnSync"
import * as WorkspaceSync from "@amends-dev/sync/WorkspaceSync"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import * as Context from "effect/Context"
import type * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as Layer from "effect/Layer"
import * as RpcClient from "effect/rpc/RpcClient"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as Api from "../api.ts"
import * as Expected from "./Expected.ts"
import * as Replica from "./Replica.ts"
import * as SyncKey from "./SyncKey.ts"

/** Whose store to open, of which workspace and as which member of it, on which host, and the session. */
export interface Options {
  readonly apiUrl: string
  readonly token: string
  readonly humanId: Identity.HumanId
  readonly workspaceId: WorkspaceId.WorkspaceId
  readonly memberId: MemberId.MemberId
}

const makeWrite = EventLog.makeClient(SyncSchema.SyncSchema)

/** Write an action, `write("ThreadMessagePosted", { threadId, text, mentions })`, as eventlog's client does. */
export type Write = Effect.Success<typeof makeWrite>

/**
 * A store, open for as long as the scope that opened it. Its reads fail when the replica cannot be
 * read, or a commit cannot be written to it.
 */
export class Store extends Context.Service<
  Store,
  {
    readonly write: Write
    readonly list: Replica.Replica["Service"]["list"]
    readonly threads: Replica.Replica["Service"]["threads"]
    readonly actions: Replica.Replica["Service"]["actions"]
    readonly dismiss: Replica.Replica["Service"]["dismiss"]
  }
>()("@amends-dev/app-v2/sync/Store") {}

/** The prefix of every database the person's stores keep on the host at `apiUrl`. */
const databasePrefix = (apiUrl: string, humanId: Identity.HumanId) => `amends/${apiUrl}/${humanId}/`

type QueryError = IndexedDbQueryBuilder.IndexedDbQueryError

/**
 * Apply each `ReplicaChanged` to the replica. Eventlog logs a handler's failure and records the
 * entry anyway, so a failure completes `failed` instead, which ends the store's reads.
 */
const layerReplicaChanges = (failed: Deferred.Deferred<never, QueryError>) =>
  EventLog.group(ReplicaSync.Changes, (handlers) =>
    handlers.handle("ReplicaChanged", ({ payload }) =>
      Effect.flatMap(Replica.Replica, (replica) => replica.apply(payload)).pipe(
        Effect.catch((error) => Effect.asVoid(Deferred.fail(failed, error)))
      )
    )
  )

/**
 * Hold each of `group`'s actions as pending, with what `expected` says it creates. A local handler
 * runs before eventlog journals the action, so one that fails fails the write itself.
 */
const layerActions = <Events extends Event.Any>(
  group: EventGroup.EventGroup<Events>,
  author: Pick<Options, "workspaceId" | "memberId">,
  expected: {
    readonly [Tag in Event.Tag<Events>]?: Expected.Expectation<Event.PayloadWithTag<Events, Tag>>
  } = {}
): Layer.Layer<Event.ToService<Events>, never, Replica.Replica | Crypto.Crypto | EventLog.Registry> =>
  EventLog.group(group, (handlers) => {
    // Every action is held alike, so its handler is built from the group's own events.
    let built: EventLog.Handlers<unknown, Event.Any> = handlers as never
    for (const tag of Object.keys(group.events)) {
      const expectation = (expected as Record<string, Expected.Expectation<unknown> | undefined>)[tag]
      built = built.handle(tag, ({ payload, entry }) =>
        Effect.gen(function* () {
          const action = {
            ...author,
            key: Request.Key.make(entry.idString),
            writtenAt: DateTime.makeUnsafe(EventJournal.entryIdMillis(entry.id))
          }
          const records = expectation === undefined ? [] : yield* expectation(payload, action)
          const replica = yield* Replica.Replica
          yield* replica.hold({ key: action.key, tag, payload: entry.payload, writtenAt: action.writtenAt }, records)
        }).pipe(Effect.orDie)
      ) as never
    }
    return built as never
  }) as never

/** As often as eventlog tries a remote again: quickly at first, then every ten seconds. */
const reconnecting = Schedule.min([Schedule.exponential("200 millis", 1.5), Schedule.spaced("10 seconds")])

/**
 * Register the browser's key, then join the host's sync server as the event log's remote until its
 * connection drops. Eventlog's remote asks for changes from the position it first asked from for as
 * long as it lives, which after a drop the server would answer with a reset, and a reset leaves out
 * how the actions committed before it ended; a remote built anew asks from what the replica holds.
 */
const connectOnce = (options: Options, identity: EventLog.Identity["Service"]) =>
  Effect.gen(function* () {
    const client = yield* Api.client(options.apiUrl, options.token)
    yield* client.me.registerSyncKey({ params: { publicKey: identity.publicKey } })
    const dropped = yield* Deferred.make<void>()
    let connected = false
    const hooks = RpcClient.ConnectionHooks.of({
      onConnect: Effect.sync(() => {
        connected = true
      }),
      // Attempts that never connected are the client's own to retry.
      onDisconnect: Effect.suspend(() =>
        connected ? Effect.asVoid(Deferred.succeed(dropped, undefined)) : Effect.void
      )
    })
    yield* Layer.build(
      SyncClient.layer(options.apiUrl).pipe(Layer.provide(Layer.succeed(RpcClient.ConnectionHooks, hooks)))
    )
    yield* Deferred.await(dropped)
  }).pipe(Effect.scoped)

/** Stay joined to the host's sync server for as long as the store is open, trying again until it can. */
const connect = (options: Options, identity: EventLog.Identity["Service"]) =>
  connectOnce(options, identity).pipe(
    Effect.tapCause((cause) => Effect.logWarning("The store could not reach its host", cause)),
    Effect.retry(reconnecting),
    Effect.forever
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
      const failed = yield* Deferred.make<never, QueryError>()
      const named = databasePrefix(options.apiUrl, options.humanId) + options.workspaceId
      const handlers = Layer.mergeAll(
        layerActions(WorkspaceSync.Actions, options),
        layerActions(GroupSync.Actions, options),
        layerActions(ThreadSync.Actions, options, {
          ThreadStarted: Expected.threadStarted,
          ThreadMessagePosted: Expected.messagePosted
        }),
        layerActions(TaskSync.Actions, options),
        layerActions(TurnSync.Actions, options),
        layerActions(NotificationSync.Actions, options),
        layerActions(ConnectionSync.Actions, options),
        layerActions(AgentSync.Actions, options),
        layerActions(ChannelSync.Actions, options),
        layerReplicaChanges(failed)
      )
      const eventLog = EventLog.layer(SyncSchema.SyncSchema, handlers).pipe(
        Layer.provide(EventJournal.layerIndexedDb({ database: `${named}/journal` })),
        Layer.provide(Layer.succeed(EventLog.Identity, identity)),
        Layer.provide(Layer.succeed(EventLog.CurrentStoreId, EventLogMessage.StoreId.make(options.workspaceId)))
      )
      const remote = Layer.effectDiscard(Effect.forkScoped(connect(options, identity)))
      const store = Layer.effect(
        Store,
        Effect.gen(function* () {
          const replica = yield* Replica.Replica
          const untilFailed = <A, E>(stream: Stream.Stream<A, E>) =>
            Stream.interruptWhen(stream, Deferred.await(failed))
          return Store.of({
            write: yield* makeWrite,
            list: (kind, place) => untilFailed(replica.list(kind, place)),
            threads: (groupId) => untilFailed(replica.threads(groupId)),
            actions: untilFailed(replica.actions),
            dismiss: replica.dismiss
          })
        })
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

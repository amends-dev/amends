import { Identity } from "@amends-dev/core/identity"
import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import { Workspace } from "@amends-dev/core/workspace"
import { GroupSync, ReplicaSync, SyncClient } from "@amends-dev/sync"
import { describe, expect, it } from "@effect/vitest"
import { Context, Duration, Effect, Layer, Queue, Schema } from "effect"
import type * as Event from "effect/eventlog/Event"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as Socket from "effect/socket/Socket"
import { setup } from "./database.ts"
import { type Server, serving } from "./server.ts"

const alice = Identity.HumanId.make("alice")
const { available, withDatabase } = setup()
const replicaChanged = ReplicaSync.Changes.events.ReplicaChanged!
// An action as any browser writes one, whichever event of its group it is.
const teamCreated: Event.Any = GroupSync.Actions.events.TeamCreated!
const decodeBatch = Schema.decodeEffect(replicaChanged.payloadSchemaBinary)
const encodeTeam = Schema.encodeEffect(teamCreated.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>)

/** Alice's new workspace on `server`, created over HTTP. */
const createWorkspace = (server: Server, name: string) =>
  Effect.promise(() => server.call(alice, "POST", "/workspaces", { name, memberName: "alice" })).pipe(
    Effect.flatMap(({ body }) => Schema.decodeUnknownEffect(Workspace.Workspace)(body))
  )

/**
 * A browser of alice's: an eventlog identity of its own, whose key she registers over HTTP, and
 * the sync server of `server`, reached as `SyncClient` reaches it.
 */
const openBrowser = Effect.fnUntraced(function* (server: Server) {
  const identity = yield* EventLog.makeIdentity
  const registered = yield* Effect.promise(() => server.call(alice, "PUT", `/me/sync-keys/${identity.publicKey}`))
  expect(registered.status).toBe(204)
  const remote = yield* Layer.build(
    SyncClient.layer(server.base).pipe(Layer.provide([EventLog.layerRegistry, Socket.layerWebSocketConstructorGlobal]))
  ).pipe(Effect.map(Context.get(EventLogRemote.EventLogRemote)))
  /** The store of `workspace`: each batch as it arrives, from the start. */
  const follow = Effect.fnUntraced(function* (workspace: Workspace.Workspace) {
    const entries = yield* remote.changes({
      identity,
      storeId: EventLogMessage.StoreId.make(workspace.id),
      startSequence: 0
    })
    return Effect.flatMap(Queue.take(entries), (remoteEntry) => decodeBatch(new Uint8Array(remoteEntry.entry.payload)))
  })
  /** Create a team in `workspace`, as alice's browser writes the action. */
  const createTeam = Effect.fnUntraced(function* (workspace: Workspace.Workspace, name: string) {
    const payload = { name, memberIds: [workspace.ownerMemberId] }
    const entry = new EventJournal.Entry({
      id: EventJournal.makeEntryIdUnsafe(),
      event: teamCreated.tag,
      primaryKey: teamCreated.primaryKey(payload),
      payload: yield* encodeTeam(payload)
    })
    yield* remote.write({ identity, storeId: EventLogMessage.StoreId.make(workspace.id), entries: [entry] })
    return entry
  })
  return { follow, createTeam }
})

/** The keys of the records a batch carries. */
const keysIn = (batch: ReplicaChange.Batch) =>
  batch.changes.flatMap((change) =>
    ReplicaChange.ReplicaChange.isAnyOf(["Changed"])(change) ? [JSON.stringify(ReplicaRecord.keyOf(change.record))] : []
  )

/** Each test as alice's browser, whose identity signs with Web Crypto. */
const asBrowser = <A, E, R>(test: Effect.Effect<A, E, R>) =>
  Effect.scoped(test).pipe(Effect.provide(EventLogEncryption.layerSubtle))

describe.skipIf(!available)("PostgreSQL", () => {
  it.live("a browser registers its key and keeps a workspace in sync over the host's WebSocket", () =>
    withDatabase((url) =>
      asBrowser(
        Effect.gen(function* () {
          const server = yield* serving(url)
          const workspace = yield* createWorkspace(server, "Sync")
          const browser = yield* openBrowser(server)
          const next = yield* browser.follow(workspace)
          const reset = yield* next
          expect(reset.changes.some(ReplicaChange.ReplicaChange.isAnyOf(["Reset"]))).toBe(true)
          expect(keysIn(reset)).toContain(JSON.stringify(ReplicaRecord.Key.cases.Workspace.make({ id: workspace.id })))
          const created = yield* browser.createTeam(workspace, "Crew")
          const changed = yield* next
          expect(changed.position).toBeGreaterThan(reset.position)
          expect(changed.changes.filter(ReplicaChange.ReplicaChange.isAnyOf(["Completed"]))).toEqual([
            ReplicaChange.ReplicaChange.cases.Completed.make({ key: Request.Key.make(created.idString) })
          ])
        })
      )
    )
  )

  it.live(
    "the smallest pool serves writes and reads while sync streams are open",
    () =>
      withDatabase((url) =>
        asBrowser(
          Effect.gen(function* () {
            const server = yield* serving(url, { env: { AMENDS_DATABASE_POOL_SIZE: "5" } })
            const workspace = yield* createWorkspace(server, "Pool")
            // The claim and shard locks hold two of the five connections.
            for (let browser = 0; browser < 2; browser++)
              yield* Effect.flatten((yield* openBrowser(server)).follow(workspace))
            const statuses = yield* Effect.forEach(
              [
                ...Array.from(
                  { length: 10 },
                  (_, index) => () =>
                    server.call(alice, "POST", "/groups", { name: `pool-${index}`, memberIds: [] }, workspace.id)
                ),
                ...Array.from(
                  { length: 20 },
                  () => () => server.call(alice, "GET", "/groups?limit=10", undefined, workspace.id)
                )
              ],
              (request) => Effect.promise(request).pipe(Effect.map((response) => response.status)),
              { concurrency: "unbounded" }
            )
            expect(statuses.toSorted((a, b) => a - b)).toEqual([
              ...Array.from({ length: 20 }, () => 200),
              ...Array.from({ length: 10 }, () => 201)
            ])
          })
        )
      ),
    20_000
  )

  it.live("stopping the host closes open sync sockets at once, and the browser hears it", () =>
    withDatabase((url) =>
      asBrowser(
        Effect.gen(function* () {
          const server = yield* serving(url)
          const workspace = yield* createWorkspace(server, "Stop")
          const next = yield* (yield* openBrowser(server)).follow(workspace)
          yield* next
          // The process itself exits only at its graceful stop's limit: Bun's stop waits for a
          // socket open as it began, even once closed. The test's scope kills it.
          yield* Effect.forkScoped(Effect.promise(() => server.stop()))
          const [heardAfter, closed] = yield* Effect.timed(Effect.flip(next))
          // Without the drain, the socket would stay open until that limit, twenty seconds.
          expect(Duration.toMillis(heardAfter)).toBeLessThan(5_000)
          expect(closed).toMatchObject({ method: "changes" })
        })
      )
    )
  )
})

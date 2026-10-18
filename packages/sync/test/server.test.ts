import { DeliveryJobs } from "@amends-dev/core/channel"
import { CoreError } from "@amends-dev/core/error"
import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import { TurnJobs } from "@amends-dev/core/turn"
import { Member } from "@amends-dev/core/workspace"
import {
  Accounts,
  Gateway,
  SignInStorage,
  SyncStorage,
  WorkspaceDirectory,
  WorkspaceStorage
} from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Context, Crypto, Effect, Layer, Queue, Schema } from "effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as RpcTest from "effect/rpc/RpcTest"
import { GroupSync, ReplicaSync, SyncServer } from "../src/index.ts"

/** The runtime's Web Crypto, as a host gives it. */
const webCrypto = Crypto.make({
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.promise(async () => new Uint8Array(await crypto.subtle.digest(algorithm, new Uint8Array(data))))
})
const alice = Identity.HumanId.make("alice")
const replicaChanged = ReplicaSync.Changes.events.ReplicaChanged!
const decodeBatch = Schema.decodeEffect(replicaChanged.payloadSchemaBinary)

/**
 * A gateway over memory storage with alice's workspace, the sync server over it, and an eventlog
 * client whose key alice registered.
 */
const connect = Effect.gen(function* () {
  const host = Layer.mergeAll(
    WorkspaceStorage.layerMemory,
    WorkspaceDirectory.layerMemory,
    Accounts.layerMemory,
    SignInStorage.layerMemory,
    SyncStorage.layerMemory
  ).pipe(
    Layer.provide(MemoryDatabase.layerConnection),
    Layer.provide(MemoryDatabase.layer),
    Layer.provideMerge(Layer.succeed(Crypto.Crypto, webCrypto))
  )
  const services = yield* Layer.build(
    Gateway.layer().pipe(Layer.provideMerge([host, TurnJobs.layerNoRunner, DeliveryJobs.layerNoRunner]))
  )
  const gateway = Context.get(services, Gateway.Gateway)
  const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
  const server = SyncServer.layerHandlers.pipe(Layer.provide(Layer.succeedContext(services)))
  const client = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(Effect.provide(server))
  const remote = yield* EventLogRemote.makeUnencrypted.pipe(
    Effect.provideService(EventLogRemote.EventLogRemoteClient, client),
    Effect.provide(EventLog.layerRegistry)
  )
  const identity = yield* EventLog.makeIdentity
  yield* Context.get(services, SyncStorage.SyncStorage).registerKey(identity.publicKey, alice)
  const storeId = EventLogMessage.StoreId.make(workspace.id)
  /** Write `payload` as the action `tag` of `group`, as alice's browser does. */
  const write = Effect.fnUntraced(function* (group: EventGroup.Any, tag: string, payload: unknown) {
    const event = (group as EventGroup.EventGroup<Event.Any>).events[tag]!
    const entry = new EventJournal.Entry({
      id: EventJournal.makeEntryIdUnsafe(),
      event: tag,
      primaryKey: event.primaryKey(payload),
      payload: yield* Schema.encodeEffect(event.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>)(payload)
    })
    yield* remote.write({ identity, storeId, entries: [entry] })
    return entry
  })
  /** Write `entry` again, as a browser does when it never heard the first write was taken. */
  const writeAgain = (entry: EventJournal.Entry) => remote.write({ identity, storeId, entries: [entry] })
  /** Alice's store from `startSequence`: each entry as it arrives, with the batch it carries. */
  const changesFrom = Effect.fnUntraced(function* (startSequence: number) {
    const entries = yield* remote.changes({ identity, storeId, startSequence })
    return Effect.gen(function* () {
      const remoteEntry = yield* Queue.take(entries)
      expect(remoteEntry.entry.event).toBe(replicaChanged.tag)
      return {
        sequence: remoteEntry.remoteSequence,
        batch: yield* decodeBatch(new Uint8Array(remoteEntry.entry.payload))
      }
    })
  })
  /** Remove alice's key, as signing out does. */
  const removeKey = Context.get(services, SyncStorage.SyncStorage).removeKey(identity.publicKey, alice)
  return { workspace, remote, storeId, write, writeAgain, changesFrom, removeKey }
})
/** The records a batch carries, by key. */
const keysIn = (batch: ReplicaChange.Batch) =>
  batch.changes.flatMap((change) =>
    ReplicaChange.ReplicaChange.isAnyOf(["Changed"])(change) ? [JSON.stringify(ReplicaRecord.keyOf(change.record))] : []
  )
const outcomesIn = (batch: ReplicaChange.Batch) =>
  batch.changes.filter(ReplicaChange.ReplicaChange.isAnyOf(["Completed", "Rejected"]))

/** Each test as alice's browser, whose identity signs with Web Crypto. */
const asBrowser = <A, E, R>(test: Effect.Effect<A, E, R>) =>
  Effect.scoped(test).pipe(Effect.provide(EventLogEncryption.layerSubtle))

describe("SyncServer", () => {
  it.effect("a store starts with its member's replica, and each action comes back with what it did", () =>
    asBrowser(
      Effect.gen(function* () {
        const { workspace, write, changesFrom } = yield* connect
        const next = yield* changesFrom(0)
        const reset = yield* next
        expect(reset.sequence).toBe(reset.batch.position)
        expect(reset.batch.changes[0]?._tag).toBe("Reset")
        expect(keysIn(reset.batch)).toContain(
          JSON.stringify(ReplicaRecord.Key.cases.Workspace.make({ id: workspace.id }))
        )
        const created = yield* write(GroupSync.Actions, "TeamCreated", {
          name: "Crew",
          memberIds: [workspace.ownerMemberId]
        })
        const changed = yield* next
        expect(changed.sequence).toBeGreaterThan(reset.sequence)
        // The team takes the ID the browser computes for the action's entry.
        const key = Request.Key.make(created.idString)
        const groupId = yield* Group.newId.pipe(
          Effect.provideService(Request.Current, { workspaceId: workspace.id, memberId: workspace.ownerMemberId, key }),
          Effect.provideService(Crypto.Crypto, webCrypto)
        )
        expect(keysIn(changed.batch)).toContain(JSON.stringify(ReplicaRecord.Key.cases.Group.make({ id: groupId })))
        expect(outcomesIn(changed.batch)).toEqual([ReplicaChange.ReplicaChange.cases.Completed.make({ key })])
      })
    )
  )

  it.effect("an action the server cannot do comes back as its rejection, and none runs twice", () =>
    asBrowser(
      Effect.gen(function* () {
        const { workspace, write, writeAgain, changesFrom } = yield* connect
        const next = yield* changesFrom(0)
        yield* next
        yield* write(GroupSync.Actions, "TeamCreated", { name: "Crew", memberIds: [workspace.ownerMemberId] })
        const created = yield* next
        const group = created.batch.changes
          .filter(ReplicaChange.ReplicaChange.isAnyOf(["Changed"]))
          .map(({ record }) => record)
          .find(ReplicaRecord.ReplicaRecord.isAnyOf(["Group"]))!
        const stale = yield* write(GroupSync.Actions, "GroupRenamed", {
          groupId: group.value.id,
          name: "Team",
          expectedName: "Squad"
        })
        expect(outcomesIn((yield* next).batch)).toEqual([
          ReplicaChange.ReplicaChange.cases.Rejected.make({
            key: Request.Key.make(stale.idString),
            error: new CoreError.Changed({ resource: "Group", id: group.value.id })
          })
        ])
        // An entry that is no action is rejected as invalid.
        const notAnAction = yield* write(
          ReplicaSync.Changes,
          "ReplicaChanged",
          yield* Schema.decodeEffect(ReplicaChange.Batch)({
            position: 0,
            recordedAt: "2026-10-18T12:00:00Z",
            changes: []
          })
        )
        expect(outcomesIn((yield* next).batch)).toMatchObject([
          { _tag: "Rejected", key: notAnAction.idString, error: { _tag: "CoreError.Invalid" } }
        ])
        // Written again, an action that ran does nothing: the next batch is the next action's.
        yield* writeAgain(stale)
        const read = yield* write(GroupSync.Actions, "GroupMarkedRead", { groupId: group.value.id })
        expect(outcomesIn((yield* next).batch)).toEqual([
          ReplicaChange.ReplicaChange.cases.Completed.make({ key: Request.Key.make(read.idString) })
        ])
      })
    )
  )

  it.effect("a store opened again resumes after the position its browser holds", () =>
    asBrowser(
      Effect.gen(function* () {
        const { workspace, write, changesFrom } = yield* connect
        const first = yield* changesFrom(0)
        const reset = yield* first
        yield* write(GroupSync.Actions, "TeamCreated", { name: "Crew", memberIds: [workspace.ownerMemberId] })
        const created = yield* first
        const reopened = yield* changesFrom(created.sequence + 1)
        yield* write(GroupSync.Actions, "TeamCreated", { name: "Band", memberIds: [workspace.ownerMemberId] })
        const resumed = yield* reopened
        expect(resumed.sequence).toBeGreaterThan(created.sequence)
        expect(resumed.batch.changes.some(ReplicaChange.ReplicaChange.isAnyOf(["Reset"]))).toBe(false)
        expect(reset.sequence).toBeLessThan(created.sequence)
      })
    )
  )

  it.effect("an identity no person registered, or one whose key was removed, opens no store", () =>
    asBrowser(
      Effect.gen(function* () {
        const { workspace, remote, storeId, write, writeAgain, removeKey } = yield* connect
        const created = yield* write(GroupSync.Actions, "TeamCreated", {
          name: "Crew",
          memberIds: [workspace.ownerMemberId]
        })
        const stranger = yield* EventLog.makeIdentity
        // The client tries authenticating again before it gives up on the write.
        expect(yield* Effect.flip(remote.write({ identity: stranger, storeId, entries: [created] }))).toMatchObject({
          method: "write",
          cause: { method: "authenticate", cause: { code: "Forbidden", message: "No person registered this identity" } }
        })
        yield* removeKey
        expect(yield* Effect.flip(writeAgain(created))).toMatchObject({
          method: "write",
          cause: { cause: { code: "Forbidden", message: "No person registered this identity" } }
        })
      })
    )
  )
})

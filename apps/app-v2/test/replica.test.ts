import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import { IndexedDb } from "@effect/platform-browser"
import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, Effect, Layer, Option, Schema, Stream } from "effect"
import * as Replica from "../src/sync/Replica.ts"

const { cases } = ReplicaChange.ReplicaChange
const records = ReplicaRecord.ReplicaRecord.cases

/** A record of `kind`, with random fields but those `fields` gives its value. */
const sample = (kind: ReplicaRecord.Kind, fields: object = {}) =>
  Effect.map(
    Arbitrary.sampleEffect(Arbitrary.schema(records[kind] as Schema.Schema<ReplicaRecord.ReplicaRecord>), {
      count: 1,
      seed: 7
    }),
    ([record]) => ({ ...record!, value: { ...record!.value, ...fields } }) as ReplicaRecord.ReplicaRecord
  )

const batch = (position: number, changes: ReadonlyArray<ReplicaChange.ReplicaChange>): ReplicaChange.Batch => ({
  position: position as ReplicaChange.Batch["position"],
  recordedAt: Schema.decodeSync(ReplicaChange.Batch.fields.recordedAt)("2026-10-18T12:00:00Z"),
  changes
})

/** Run `test` over a replica in a database of its own. */
const withReplica = <A, E>(test: Effect.Effect<A, E, Replica.Replica>) =>
  Effect.provide(test, Replica.layer(`replica-${crypto.randomUUID()}`).pipe(Layer.provide(IndexedDb.layerWindow)))

/** The replica, and what it holds now. */
const openReplica = Effect.map(Replica.Replica, (replica) => ({
  replica,
  counts: Effect.map(
    Stream.runHead(replica.counts),
    Option.getOrElse((): Replica.Counts => ({}))
  )
}))

describe("Replica", () => {
  it.effect("dropping a group drops what sits in it and in its threads, and dropping a thread what it holds", () =>
    withReplica(
      Effect.gen(function* () {
        const { replica, counts } = yield* openReplica
        const member = yield* sample("Member")
        const group = yield* sample("Group", { id: "group-1" })
        const other = yield* sample("Group", { id: "group-2" })
        const membership = yield* sample("GroupMembership", { id: "membership-1", groupId: "group-1" })
        const thread = yield* sample("Thread", { id: "thread-1", groupId: "group-1" })
        const kept = yield* sample("Thread", { id: "thread-2", groupId: "group-2" })
        const message = yield* sample("ThreadMessage", { id: "message-1", threadId: "thread-1" })
        const reply = yield* sample("ThreadMessage", { id: "message-2", threadId: "thread-2" })
        const task = yield* sample("Task", { threadId: "thread-2" })
        yield* replica.apply(
          batch(1, [
            cases.Reset.make({}),
            ...[member, group, other, membership, thread, kept, message, reply, task].map((record) =>
              cases.Changed.make({ record })
            )
          ])
        )
        expect(yield* counts).toEqual({ Member: 1, Group: 2, GroupMembership: 1, Thread: 2, ThreadMessage: 2, Task: 1 })
        yield* replica.apply(batch(2, [cases.Dropped.make({ key: ReplicaRecord.keyOf(group) })]))
        expect(yield* counts).toEqual({ Member: 1, Group: 1, Thread: 1, ThreadMessage: 1, Task: 1 })
        yield* replica.apply(batch(3, [cases.Dropped.make({ key: ReplicaRecord.keyOf(kept) })]))
        expect(yield* counts).toEqual({ Member: 1, Group: 1 })
      })
    )
  )

  it.effect("a batch it already holds changes nothing, and a reset applies at any position", () =>
    withReplica(
      Effect.gen(function* () {
        const { replica, counts } = yield* openReplica
        const member = yield* sample("Member", { id: "member-1" })
        const contact = yield* sample("Contact")
        const role = yield* sample("Role")
        yield* replica.apply(batch(5, [cases.Changed.make({ record: member })]))
        // Sent again after a stop, or a commit it is past: neither applies.
        yield* replica.apply(batch(5, [cases.Changed.make({ record: contact })]))
        yield* replica.apply(batch(3, [cases.Dropped.make({ key: ReplicaRecord.keyOf(member) })]))
        expect(yield* counts).toEqual({ Member: 1 })
        // Storage made anew starts over at an earlier position.
        yield* replica.apply(batch(2, [cases.Reset.make({}), cases.Changed.make({ record: role })]))
        expect(yield* counts).toEqual({ Role: 1 })
        yield* replica.apply(batch(3, [cases.Changed.make({ record: contact })]))
        expect(yield* counts).toEqual({ Role: 1, Contact: 1 })
      })
    )
  )
})

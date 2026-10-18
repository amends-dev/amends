import { CoreError } from "@amends-dev/core/error"
import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import { IndexedDb } from "@effect/platform-browser"
import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, DateTime, Effect, Layer, Option, Schema, Stream } from "effect"
import * as Replica from "../src/sync/Replica.ts"

const { cases } = ReplicaChange.ReplicaChange
const records = ReplicaRecord.ReplicaRecord.cases
const { Workspace, Group, Thread } = ReplicaRecord.Place.cases

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

/** What a read gives now. */
const now = <A, E>(stream: Stream.Stream<A, E>) => Effect.map(Stream.runHead(stream), Option.getOrThrow)

/** The IDs of the records of `kind` at `place`, and whether each is still expected. */
const held = (kind: ReplicaRecord.Kind, place: ReplicaRecord.Place) =>
  Effect.flatMap(Replica.Replica, (replica) =>
    now(replica.list(kind, place)).pipe(
      Effect.map((list) =>
        list
          .map(({ record, pending }) => [JSON.stringify(ReplicaRecord.keyOf(record)), pending] as const)
          .toSorted(([left], [right]) => left.localeCompare(right))
      )
    )
  )
const keyOf = (record: ReplicaRecord.ReplicaRecord) => JSON.stringify(ReplicaRecord.keyOf(record))

const action = (key: string) => ({
  key,
  tag: "ThreadMessagePosted",
  payload: new Uint8Array([1, 2, 3]),
  writtenAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 18))
})

describe("Replica", () => {
  it.effect("dropping a group drops what sits in it and in its threads, and dropping a thread what it holds", () =>
    withReplica(
      Effect.gen(function* () {
        const replica = yield* Replica.Replica
        const group = yield* sample("Group", { id: "group-1" })
        const other = yield* sample("Group", { id: "group-2" })
        const membership = yield* sample("GroupMembership", { id: "membership-1", groupId: "group-1" })
        const thread = yield* sample("Thread", { id: "thread-1", groupId: "group-1" })
        const kept = yield* sample("Thread", { id: "thread-2", groupId: "group-2" })
        const message = yield* sample("ThreadMessage", { id: "message-1", threadId: "thread-1" })
        const reply = yield* sample("ThreadMessage", { id: "message-2", threadId: "thread-2" })
        yield* replica.apply(
          batch(1, [
            cases.Reset.make({}),
            ...[group, other, membership, thread, kept, message, reply].map((record) => cases.Changed.make({ record }))
          ])
        )
        yield* replica.apply(batch(2, [cases.Dropped.make({ key: ReplicaRecord.keyOf(group) })]))
        expect(yield* held("Group", Workspace.make({}))).toEqual([[keyOf(other), false]])
        expect(yield* held("GroupMembership", Group.make({ groupId: "group-1" as never }))).toEqual([])
        expect(yield* held("Thread", Group.make({ groupId: "group-1" as never }))).toEqual([])
        expect(yield* held("ThreadMessage", Thread.make({ threadId: "thread-1" as never }))).toEqual([])
        expect(yield* held("ThreadMessage", Thread.make({ threadId: "thread-2" as never }))).toEqual([
          [keyOf(reply), false]
        ])
        yield* replica.apply(batch(3, [cases.Dropped.make({ key: ReplicaRecord.keyOf(kept) })]))
        expect(yield* held("Thread", Group.make({ groupId: "group-2" as never }))).toEqual([])
        expect(yield* held("ThreadMessage", Thread.make({ threadId: "thread-2" as never }))).toEqual([])
      })
    )
  )

  it.effect("a batch it already holds changes nothing, and a reset applies at any position", () =>
    withReplica(
      Effect.gen(function* () {
        const replica = yield* Replica.Replica
        const member = yield* sample("Member", { id: "member-1" })
        const contact = yield* sample("Contact")
        const role = yield* sample("Role")
        yield* replica.apply(batch(5, [cases.Changed.make({ record: member })]))
        // Sent again after a stop, or a commit it is past: neither applies.
        yield* replica.apply(batch(5, [cases.Changed.make({ record: contact })]))
        yield* replica.apply(batch(3, [cases.Dropped.make({ key: ReplicaRecord.keyOf(member) })]))
        expect(yield* held("Member", Workspace.make({}))).toEqual([[keyOf(member), false]])
        expect(yield* held("Contact", Workspace.make({}))).toEqual([])
        // Storage made anew starts over at an earlier position.
        yield* replica.apply(batch(2, [cases.Reset.make({}), cases.Changed.make({ record: role })]))
        expect(yield* held("Member", Workspace.make({}))).toEqual([])
        expect(yield* held("Role", Workspace.make({}))).toEqual([[keyOf(role), false]])
      })
    )
  )

  it.effect("an action is held with what it expects until its commit completes it, or rejects it with why", () =>
    withReplica(
      Effect.gen(function* () {
        const replica = yield* Replica.Replica
        const expected = yield* sample("ThreadMessage", { id: "message-1", threadId: "thread-1" })
        const place = Thread.make({ threadId: "thread-1" as never })
        yield* replica.hold(action("posted"), [expected])
        expect(yield* held("ThreadMessage", place)).toEqual([[keyOf(expected), true]])
        // The commit that ran it brings the server's message under the same ID, and completes it.
        const published = { ...expected, value: { ...expected.value, publishedAt: DateTime.makeUnsafe(0) } }
        yield* replica.apply(
          batch(1, [
            cases.Changed.make({ record: published as ReplicaRecord.ReplicaRecord }),
            cases.Completed.make({ key: "posted" as never })
          ])
        )
        expect(yield* held("ThreadMessage", place)).toEqual([[keyOf(expected), false]])
        expect(yield* now(replica.actions)).toEqual([])
        // A rejected one leaves nothing it expected, and keeps why until it is dismissed.
        const refused = yield* sample("ThreadMessage", { id: "message-2", threadId: "thread-1" })
        yield* replica.hold(action("refused"), [refused])
        const error = new CoreError.NotFound({ resource: "Thread", id: "thread-1" })
        yield* replica.apply(batch(2, [cases.Rejected.make({ key: "refused" as never, error })]))
        expect(yield* held("ThreadMessage", place)).toEqual([[keyOf(expected), false]])
        expect(yield* now(replica.actions)).toEqual([{ ...action("refused"), rejection: Option.some(error) }])
        yield* replica.dismiss("refused")
        expect(yield* now(replica.actions)).toEqual([])
      })
    )
  )

  it.effect("a reset keeps what the person's actions still expect", () =>
    withReplica(
      Effect.gen(function* () {
        const replica = yield* Replica.Replica
        const expected = yield* sample("ThreadMessage", { id: "message-1", threadId: "thread-1" })
        const member = yield* sample("Member")
        yield* replica.hold(action("offline"), [expected])
        yield* replica.apply(batch(1, [cases.Reset.make({}), cases.Changed.make({ record: member })]))
        expect(yield* held("ThreadMessage", Thread.make({ threadId: "thread-1" as never }))).toEqual([
          [keyOf(expected), true]
        ])
        expect(yield* held("Member", Workspace.make({}))).toEqual([[keyOf(member), false]])
      })
    )
  )
})

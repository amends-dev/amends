import { CoreError } from "@amends-dev/core/error"
import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import { IndexedDb } from "@effect/platform-browser"
import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, DateTime, Effect, Layer, Option, Schema, Stream } from "effect"
import * as Replica from "../src/store/Replica.ts"

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

/** The keys of the records of `kind` at `place`. */
const held = (kind: ReplicaRecord.Kind, place: ReplicaRecord.Place) =>
  Effect.flatMap(Replica.Replica, (replica) =>
    now(replica.list(kind, place)).pipe(
      Effect.map((list) => list.map((record) => JSON.stringify(ReplicaRecord.keyOf(record))).toSorted())
    )
  )
const keyOf = (record: ReplicaRecord.ReplicaRecord) => JSON.stringify(ReplicaRecord.keyOf(record))

const action = (key: string, creates: ReadonlyArray<ReplicaRecord.ReplicaRecord> = []) => ({
  key,
  tag: "ThreadMessagePosted",
  payload: new Uint8Array([1, 2, 3]),
  writtenAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 18)),
  creates
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
        expect(yield* held("Group", Workspace.make({}))).toEqual([keyOf(other)])
        expect(yield* held("GroupMembership", Group.make({ groupId: "group-1" as never }))).toEqual([])
        expect(yield* held("Thread", Group.make({ groupId: "group-1" as never }))).toEqual([])
        expect(yield* held("ThreadMessage", Thread.make({ threadId: "thread-1" as never }))).toEqual([])
        expect(yield* held("ThreadMessage", Thread.make({ threadId: "thread-2" as never }))).toEqual([keyOf(reply)])
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
        expect(yield* held("Member", Workspace.make({}))).toEqual([keyOf(member)])
        expect(yield* held("Contact", Workspace.make({}))).toEqual([])
        // Storage made anew starts over at an earlier position.
        yield* replica.apply(batch(2, [cases.Reset.make({}), cases.Changed.make({ record: role })]))
        expect(yield* held("Member", Workspace.make({}))).toEqual([])
        expect(yield* held("Role", Workspace.make({}))).toEqual([keyOf(role)])
      })
    )
  )

  it.effect("an action is held until its commit completes it, or rejects it with why until it is dismissed", () =>
    withReplica(
      Effect.gen(function* () {
        const replica = yield* Replica.Replica
        const expected = yield* sample("ThreadMessage", { id: "message-1", threadId: "thread-1" })
        yield* replica.hold(action("posted", [expected]))
        expect(yield* now(replica.actions)).toEqual([{ ...action("posted", [expected]), rejection: Option.none() }])
        // What it creates is read on top of the replica, not written to it.
        expect(yield* held("ThreadMessage", Thread.make({ threadId: "thread-1" as never }))).toEqual([])
        yield* replica.apply(batch(1, [cases.Completed.make({ key: "posted" as never })]))
        expect(yield* now(replica.actions)).toEqual([])
        yield* replica.hold(action("refused"))
        const error = new CoreError.NotFound({ resource: "Thread", id: "thread-1" })
        yield* replica.apply(batch(2, [cases.Rejected.make({ key: "refused" as never, error })]))
        expect(yield* now(replica.actions)).toEqual([{ ...action("refused"), rejection: Option.some(error) }])
        yield* replica.dismiss("refused")
        expect(yield* now(replica.actions)).toEqual([])
      })
    )
  )

  it.effect("the tasks come with the threads that track them and those threads' messages, and no other thread's", () =>
    withReplica(
      Effect.gen(function* () {
        const replica = yield* Replica.Replica
        const tracked = yield* sample("Thread", { id: "thread-1" })
        const plain = yield* sample("Thread", { id: "thread-2" })
        const promised = yield* sample("Thread", { id: "thread-3" })
        const refused = yield* sample("Thread", { id: "thread-4" })
        const task = yield* sample("Task", { threadId: "thread-1" })
        const trackedMessage = yield* sample("ThreadMessage", { id: "message-1", threadId: "thread-1" })
        const plainMessage = yield* sample("ThreadMessage", { id: "message-2", threadId: "thread-2" })
        const promisedMessage = yield* sample("ThreadMessage", { id: "message-3", threadId: "thread-3" })
        const refusedMessage = yield* sample("ThreadMessage", { id: "message-4", threadId: "thread-4" })
        yield* replica.apply(
          batch(1, [
            cases.Reset.make({}),
            ...[
              tracked,
              plain,
              promised,
              refused,
              task,
              trackedMessage,
              plainMessage,
              promisedMessage,
              refusedMessage
            ].map((record) => cases.Changed.make({ record }))
          ])
        )
        const keysOf = (list: ReadonlyArray<ReplicaRecord.ReplicaRecord>) => list.map(keyOf).toSorted()
        const read = Effect.map(now(replica.tasks), ({ tasks, threads, messages }) => ({
          tasks: keysOf(tasks),
          threads: keysOf(threads),
          messages: keysOf(messages)
        }))
        expect(yield* read).toEqual({
          tasks: [keyOf(task)],
          threads: [keyOf(tracked)],
          messages: [keyOf(trackedMessage)]
        })

        // The thread of a task an unfinished action creates is read too, until the server refuses the action.
        yield* replica.hold(action("promised", [yield* sample("Task", { threadId: "thread-3" })]))
        yield* replica.hold(action("refused", [yield* sample("Task", { threadId: "thread-4" })]))
        const error = new CoreError.NotFound({ resource: "Thread", id: "thread-4" })
        yield* replica.apply(batch(2, [cases.Rejected.make({ key: "refused" as never, error })]))
        expect(yield* read).toEqual({
          tasks: [keyOf(task)],
          threads: keysOf([tracked, promised]),
          messages: keysOf([trackedMessage, promisedMessage])
        })
      })
    )
  )

  it.effect("a reset leaves the person's actions as they are", () =>
    withReplica(
      Effect.gen(function* () {
        const replica = yield* Replica.Replica
        const member = yield* sample("Member")
        yield* replica.hold(action("offline"))
        yield* replica.apply(batch(1, [cases.Reset.make({}), cases.Changed.make({ record: member })]))
        expect((yield* now(replica.actions)).map(({ key }) => key)).toEqual(["offline"])
        expect(yield* held("Member", Workspace.make({}))).toEqual([keyOf(member)])
      })
    )
  )
})

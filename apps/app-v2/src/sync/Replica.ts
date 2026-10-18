/**
 * The replica: the records one member's browser keeps of one workspace, in an IndexedDB database of
 * its own, each under its key with its kind and the place it sits; the actions their browser wrote
 * that the server has not finished; and the position of the last commit it applied.
 *
 * `apply` writes one commit's batch in one transaction, so the replica holds a commit or none of it,
 * and passes over a batch it already holds: eventlog runs a remote entry's handler before its
 * journal records the entry, so a browser that stopped between the two is sent the entry again. A
 * reset applies whatever its position, since storage made anew starts over.
 *
 * An action the person writes is held with the records it is expected to create, each marked with
 * the action's key, under the IDs the server will give them. The commit that runs the action
 * changes those records as the server made them, which leaves them unmarked, and completes the
 * action, which drops the action and what remains marked with it; a rejection drops the records it
 * expected and keeps the action, with why, until the person dismisses it. A reset keeps what is
 * marked, since the actions it was written for are still on their way.
 */

import type { CoreError } from "@amends-dev/core/error"
import { CoreError as CoreErrors } from "@amends-dev/core/error"
import type { GroupId } from "@amends-dev/core/group"
import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import type { ThreadMessage } from "@amends-dev/core/thread"
import type * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as IndexedDbDatabase from "@effect/platform-browser/IndexedDbDatabase"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import * as IndexedDbVersion from "@effect/platform-browser/IndexedDbVersion"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import type * as Stream from "effect/Stream"

/**
 * A record under its key, with its kind and the place it sits, by which a dropped group or thread
 * finds it, and the key of the action whose expected record it is, or empty once it is the
 * server's: an index holds only keys, so an absent one is the empty string.
 */
const Row = Schema.Struct({
  key: Schema.String,
  kind: Schema.String,
  place: Schema.String,
  pending: Schema.String,
  record: Schema.toCodecJson(ReplicaRecord.ReplicaRecord)
})

class Records extends IndexedDbTable.make({
  name: "records",
  schema: Row,
  keyPath: "key",
  indexes: { byKind: "kind", byPlace: "place", byKindAndPlace: ["kind", "place"], byPending: "pending" }
}) {}

/** An action the person's browser wrote, as eventlog journaled it, and why the server rejected it. */
const ActionRow = Schema.Struct({
  key: Schema.String,
  tag: Schema.String,
  payload: Schema.Uint8Array,
  writtenAt: Schema.DateTimeUtcFromMillis,
  rejection: Schema.NullOr(Schema.toCodecJson(CoreErrors.Rejection))
})

class Actions extends IndexedDbTable.make({ name: "actions", schema: ActionRow, keyPath: "key" }) {}

/** The last commit the replica applied: its position, and when it was recorded. */
const Applied = Schema.Struct({
  id: Schema.Literal("applied"),
  position: ReplicaChange.Batch.fields.position,
  recordedAt: ReplicaChange.Batch.fields.recordedAt
})

class Positions extends IndexedDbTable.make({ name: "positions", schema: Applied, keyPath: "id" }) {}

class Version1 extends IndexedDbVersion.make(Records, Actions, Positions) {}

class Database extends IndexedDbDatabase.make(
  Version1,
  Effect.fnUntraced(function* (api) {
    yield* api.createObjectStore("records")
    yield* api.createIndex("records", "byKind")
    yield* api.createIndex("records", "byPlace")
    yield* api.createIndex("records", "byKindAndPlace")
    yield* api.createIndex("records", "byPending")
    yield* api.createObjectStore("actions")
    yield* api.createObjectStore("positions")
  })
) {}

const keyText = Schema.encodeSync(Schema.fromJsonString(ReplicaRecord.Key))

/** The place a record sits, as its row names it. */
const placeText = (place: ReplicaRecord.Place): string =>
  ReplicaRecord.Place.match(place, {
    Workspace: () => "workspace",
    Group: ({ groupId }) => `group:${groupId}`,
    Thread: ({ threadId }) => `thread:${threadId}`
  })

/** The row `record` is held in, marked with the key of the action it is expected of, if any. */
const rowOf = (record: ReplicaRecord.ReplicaRecord, pending = "") => ({
  key: keyText(ReplicaRecord.keyOf(record)),
  kind: record._tag,
  place: placeText(ReplicaRecord.placeOf(record)),
  pending,
  record
})

/** A record the replica holds, and whether it is what one of the person's actions is expected to make. */
export interface Held<Record extends ReplicaRecord.ReplicaRecord = ReplicaRecord.ReplicaRecord> {
  readonly record: Record
  readonly pending: boolean
}

/** An action the person's browser wrote that the server has not completed, with its rejection, if any. */
export interface Action {
  readonly key: string
  readonly tag: string
  /** The action's payload as eventlog encodes it, which its event decodes. */
  readonly payload: Uint8Array
  readonly writtenAt: DateTime.Utc
  readonly rejection: Option.Option<CoreError.Rejection>
}

/** A thread the replica holds, with its opening message, the earliest it holds of it. */
export interface Opened {
  readonly thread: Held<Extract<ReplicaRecord.ReplicaRecord, { readonly _tag: "Thread" }>>
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
}

type QueryError = IndexedDbQueryBuilder.IndexedDbQueryError

/**
 * One store's replica, open for as long as the scope that opened it.
 */
export class Replica extends Context.Service<
  Replica,
  {
    /** Apply one commit's batch, whole, in one transaction. */
    readonly apply: (batch: ReplicaChange.Batch) => Effect.Effect<void, QueryError>
    /** Hold an action the person wrote, with the records it is expected to create, in one transaction. */
    readonly hold: (
      action: Omit<Action, "rejection">,
      expected: ReadonlyArray<ReplicaRecord.ReplicaRecord>
    ) => Effect.Effect<void, QueryError>
    /** Forget a rejected action, once the person has seen why. */
    readonly dismiss: (key: string) => Effect.Effect<void, QueryError>
    /** The records of `kind` that sit at `place`, and again after each change to the replica. */
    readonly list: <Kind extends ReplicaRecord.Kind>(
      kind: Kind,
      place: ReplicaRecord.Place
    ) => Stream.Stream<ReadonlyArray<Held<Extract<ReplicaRecord.ReplicaRecord, { readonly _tag: Kind }>>>, QueryError>
    /** The threads of `groupId`, each with its opening message, and again after each change. */
    readonly threads: (groupId: GroupId.GroupId) => Stream.Stream<ReadonlyArray<Opened>, QueryError>
    /** The person's actions the server has not completed, and again after each change to them. */
    readonly actions: Stream.Stream<ReadonlyArray<Action>, QueryError>
  }
>()("@amends-dev/app-v2/sync/Replica") {}

const make = Effect.gen(function* () {
  const query = yield* Database.getQueryBuilder
  const records = query.from("records")
  const actions = query.from("actions")
  const positions = query.from("positions")
  const dropPlace = (place: ReplicaRecord.Place) => records.delete("byPlace").equals(placeText(place))
  const dropExpected = (key: string) => records.delete("byPending").equals(key)

  /** Drop the record under `key`, and with a group or a thread what sits in it. */
  const drop = Effect.fnUntraced(function* (key: ReplicaRecord.Key) {
    if (ReplicaRecord.Key.isAnyOf(["Group"])(key)) {
      const group = ReplicaRecord.Place.cases.Group.make({ groupId: key.id })
      const threads = yield* records.select("byKindAndPlace").equals(["Thread", placeText(group)])
      for (const { record } of threads)
        if (ReplicaRecord.ReplicaRecord.isAnyOf(["Thread"])(record))
          yield* dropPlace(ReplicaRecord.Place.cases.Thread.make({ threadId: record.value.id }))
      yield* dropPlace(group)
    }
    if (ReplicaRecord.Key.isAnyOf(["Thread"])(key))
      yield* dropPlace(ReplicaRecord.Place.cases.Thread.make({ threadId: key.id }))
    yield* records.delete().equals(keyText(key))
  })

  /** Drop everything but what the person's actions still expect. */
  const reset = Effect.gen(function* () {
    const expected = yield* records.select("byPending").gt("")
    yield* records.clear
    if (expected.length > 0) yield* records.upsertAll([...expected])
  })

  /** Keep why the server rejected the action `key`, and drop what it expected. */
  const reject = Effect.fnUntraced(function* (key: string, error: CoreError.Rejection) {
    const [action] = yield* actions.select().equals(key)
    if (action !== undefined) yield* actions.upsert({ ...action, rejection: error })
    yield* dropExpected(key)
  })

  const applyChange = (change: ReplicaChange.ReplicaChange) =>
    Match.valueTags(change, {
      Changed: ({ record }) => records.upsert(rowOf(record)),
      Dropped: ({ key }) => drop(key),
      Reset: () => reset,
      Completed: ({ key }) => Effect.andThen(actions.delete().equals(key), dropExpected(key)),
      Rejected: ({ key, error }) => reject(key, error)
    })

  const resets = ReplicaChange.ReplicaChange.isAnyOf(["Reset"])

  /** Apply `batch` unless the replica already holds it, and keep its position. */
  const applyOnce = Effect.fnUntraced(function* (batch: ReplicaChange.Batch) {
    const [applied] = yield* positions.select().equals("applied")
    if (applied !== undefined && batch.position <= applied.position && !batch.changes.some(resets)) return
    yield* Effect.forEach(batch.changes, applyChange, { discard: true })
    yield* positions.upsert({ id: "applied", position: batch.position, recordedAt: batch.recordedAt })
  })

  const selectHeld = <Kind extends ReplicaRecord.Kind>(kind: Kind, place: ReplicaRecord.Place) => {
    const isKind = ReplicaRecord.ReplicaRecord.isAnyOf([kind])
    return Effect.map(records.select("byKindAndPlace").equals([kind, placeText(place)]), (rows) =>
      rows.flatMap(({ record, pending }) => (isKind(record) ? [{ record, pending: pending !== "" }] : []))
    )
  }

  /** The threads of `groupId`, each with the earliest message the replica holds of it. */
  const selectThreads = (groupId: GroupId.GroupId) =>
    Effect.flatMap(selectHeld("Thread", ReplicaRecord.Place.cases.Group.make({ groupId })), (threads) =>
      Effect.forEach(threads, (thread) =>
        Effect.map(
          selectHeld("ThreadMessage", ReplicaRecord.Place.cases.Thread.make({ threadId: thread.record.value.id })),
          (messages): Opened => ({
            thread,
            opening: Array.head(
              Array.sort(
                messages.map(({ record }) => record.value),
                Order.mapInput(DateTime.Order, (message: ThreadMessage.ThreadMessage) => message.publishedAt)
              )
            )
          })
        )
      )
    )

  const changing = <A, E>(tables: ReadonlyArray<"records" | "actions">, effect: Effect.Effect<A, E>) =>
    query.reactivity.mutation(tables, effect)

  return Replica.of({
    apply: (batch) =>
      changing(
        ["records", "actions"],
        query.withTransaction({ tables: ["records", "actions", "positions"], mode: "readwrite" })(applyOnce(batch))
      ),
    hold: (action, expected) =>
      changing(
        ["records", "actions"],
        query.withTransaction({ tables: ["records", "actions"], mode: "readwrite" })(
          Effect.gen(function* () {
            yield* actions.upsert({ ...action, payload: new Uint8Array(action.payload), rejection: null })
            for (const record of expected) yield* records.upsert(rowOf(record, action.key))
          })
        )
      ),
    dismiss: (key) => changing(["actions"], actions.delete().equals(key)),
    list: (kind, place) => query.reactivity.stream(["records"], selectHeld(kind, place)),
    threads: (groupId) => query.reactivity.stream(["records"], selectThreads(groupId)),
    actions: query.reactivity.stream(
      ["actions"],
      Effect.map(actions.select(), (rows) =>
        rows.map(({ rejection, ...action }) => ({ ...action, rejection: Option.fromNullOr(rejection) }))
      )
    )
  })
})

/**
 * Open the replica in the IndexedDB database `name`, creating it empty the first time.
 *
 * @category layers
 */
export const layer = (
  name: string
): Layer.Layer<Replica, IndexedDbDatabase.IndexedDbDatabaseError, IndexedDb.IndexedDb> =>
  Layer.effect(Replica, make).pipe(Layer.provide(Database.layer(name)))

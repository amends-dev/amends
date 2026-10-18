/**
 * The replica: the records one member's browser keeps of one workspace, in an IndexedDB database of
 * its own, each under its key with its kind and the place it sits, and the position of the last
 * commit it applied. `apply` writes one commit's batch in one transaction, so the replica holds a
 * commit or none of it, and passes over a batch it already holds: eventlog runs a remote entry's
 * handler before its journal records the entry, so a browser that stopped between the two is sent
 * the entry again. A reset applies whatever its position, since storage made anew starts over.
 */

import { ReplicaChange, ReplicaRecord } from "@amends-dev/core/replica"
import type * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as IndexedDbDatabase from "@effect/platform-browser/IndexedDbDatabase"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import * as IndexedDbVersion from "@effect/platform-browser/IndexedDbVersion"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"
import type * as Stream from "effect/Stream"

/** A record under its key, with its kind, and the place it sits, by which a dropped group or thread finds it. */
const Row = Schema.Struct({
  key: Schema.String,
  kind: Schema.String,
  place: Schema.String,
  record: Schema.toCodecJson(ReplicaRecord.ReplicaRecord)
})

class Records extends IndexedDbTable.make({
  name: "records",
  schema: Row,
  keyPath: "key",
  indexes: { byKind: "kind", byPlace: "place", byKindAndPlace: ["kind", "place"] }
}) {}

/** The last commit the replica applied: its position, and when it was recorded. */
const Applied = Schema.Struct({
  id: Schema.Literal("applied"),
  position: ReplicaChange.Batch.fields.position,
  recordedAt: ReplicaChange.Batch.fields.recordedAt
})

class Positions extends IndexedDbTable.make({ name: "positions", schema: Applied, keyPath: "id" }) {}

class Version1 extends IndexedDbVersion.make(Records, Positions) {}

class Database extends IndexedDbDatabase.make(
  Version1,
  Effect.fnUntraced(function* (api) {
    yield* api.createObjectStore("records")
    yield* api.createIndex("records", "byKind")
    yield* api.createIndex("records", "byPlace")
    yield* api.createIndex("records", "byKindAndPlace")
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

const rowOf = (record: ReplicaRecord.ReplicaRecord) => ({
  key: keyText(ReplicaRecord.keyOf(record)),
  kind: record._tag,
  place: placeText(ReplicaRecord.placeOf(record)),
  record
})

/** How many records of each kind the replica holds; a kind it holds none of is left out. */
export type Counts = Readonly<Partial<Record<ReplicaRecord.Kind, number>>>

/**
 * One store's replica, open for as long as the scope that opened it.
 */
export class Replica extends Context.Service<
  Replica,
  {
    /** Apply one commit's batch, whole, in one transaction. */
    readonly apply: (batch: ReplicaChange.Batch) => Effect.Effect<void, IndexedDbQueryBuilder.IndexedDbQueryError>
    /** How many records of each kind the replica holds, and again after each batch it applies. */
    readonly counts: Stream.Stream<Counts, IndexedDbQueryBuilder.IndexedDbQueryError>
  }
>()("@amends-dev/app-v2/sync/Replica") {}

const kinds = Object.keys(ReplicaRecord.ReplicaRecord.cases) as ReadonlyArray<ReplicaRecord.Kind>

const make = Effect.gen(function* () {
  const query = yield* Database.getQueryBuilder
  const records = query.from("records")
  const dropPlace = (place: ReplicaRecord.Place) => records.delete("byPlace").equals(placeText(place))

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

  const applyChange = (change: ReplicaChange.ReplicaChange) =>
    Match.valueTags(change, {
      Changed: ({ record }) => records.upsert(rowOf(record)),
      Dropped: ({ key }) => drop(key),
      Reset: () => records.clear,
      // How the member's own actions ended, which their browser applies nothing of yet.
      Completed: () => Effect.void,
      Rejected: () => Effect.void
    })

  const countKinds = Effect.map(
    Effect.forEach(kinds, (kind) =>
      Effect.map(records.count("byKind").equals(kind), (count) => [kind, count] as const)
    ),
    (counted): Counts => Object.fromEntries(counted.filter(([, count]) => count > 0))
  )

  const positions = query.from("positions")
  const resets = ReplicaChange.ReplicaChange.isAnyOf(["Reset"])

  /** Apply `batch` unless the replica already holds it, and keep its position. */
  const applyOnce = Effect.fnUntraced(function* (batch: ReplicaChange.Batch) {
    const [applied] = yield* positions.select().equals("applied")
    if (applied !== undefined && batch.position <= applied.position && !batch.changes.some(resets)) return
    yield* Effect.forEach(batch.changes, applyChange, { discard: true })
    yield* positions.upsert({ id: "applied", position: batch.position, recordedAt: batch.recordedAt })
  })

  return Replica.of({
    apply: (batch) =>
      query.reactivity.mutation(
        ["records"],
        query.withTransaction({ tables: ["records", "positions"], mode: "readwrite" })(applyOnce(batch))
      ),
    counts: query.reactivity.stream(["records"], countKinds)
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

import { Event, Fact, Journal, Publication, Subject } from "@amends-dev/core/journal"
import { Codec, Entry } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { boundTo, core, inDatabase, setup, testProvenance, workspaceId } from "./support.ts"

const testSubject = () => Subject.make("test", "entity")
const Changed = Fact.make("storage.changed", {
  subject: testSubject,
  version: 1,
  payload: Schema.String
})
const Changed2 = Fact.make(Changed.name, {
  subject: testSubject,
  version: 2,
  payload: Schema.String
})
const Other = Fact.make("storage.other", {
  subject: testSubject,
  version: 1,
  payload: Schema.String
})

const { available, withDatabase } = setup()
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect("a fact's name and subject are stored in queryable columns beside its binary payload", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* Effect.gen(function* () {
            const journal = yield* Journal.Journal
            yield* journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(Changed, "first")
                yield* journal.publish(Other, "noise")
                yield* journal.publish(Changed2, "second")
              })
            )
            yield* journal.publish(Changed, "third")
          }).pipe(
            Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
            Effect.provide(core(bound))
          )
          const rows =
            yield* (yield* SqlClient.SqlClient)`SELECT name, subject, payload FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${Entry.LogId.make("journal")} ORDER BY position, entry_index`
          expect(rows.map((row) => row.name)).toEqual([Changed.name, Other.name, Changed.name, Changed.name])
          expect(new Set(rows.map((row) => row.subject))).toEqual(new Set([Subject.make("test", "entity")]))
          // The version and provenance travel in the bytes, with the encoded payload.
          const first = yield* Event.storageCodec.decode({
            name: String(rows[0]?.name),
            subject: String(rows[0]?.subject),
            payload: rows[0]?.payload as Uint8Array
          })
          expect(first).toMatchObject({ version: 1, provenance: { workspaceId } })
          expect(first.payload).toEqual(yield* Codec.makeForSchema(Changed.payload).encode("first"))
        })
      )
    )
  )
})

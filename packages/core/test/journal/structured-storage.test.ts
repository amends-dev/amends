import { Subject } from "@amends-dev/core/journal"
import * as Codec from "@amends-dev/log/Codec"
import * as Entry from "@amends-dev/log/Entry"
import * as Log from "@amends-dev/log/Log"
import * as Store from "@amends-dev/log/Store"
import type * as Transaction from "@amends-dev/log/Transaction"
import { expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import * as Checkpoint from "../../src/journal/Checkpoint.ts"
import * as Event from "../../src/journal/Event.ts"
import * as Fact from "../../src/journal/Fact.ts"
import * as Journal from "../../src/journal/Journal.ts"
import * as Publication from "../../src/journal/Publication.ts"
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts"
import { make, type Fixture } from "../memory.ts"
import { testProvenance } from "../publication.ts"

const testSubject = () => Subject.make("test", "entity")
const workspaceId = WorkspaceId.WorkspaceId.make("workspace-one")
const logId = Entry.LogId.make("journal")
const Changed = Fact.make("example.changed", {
  subject: testSubject,
  version: 1,
  payload: Schema.FiniteFromString
})
const Changed2 = Fact.make(Changed.name, {
  subject: testSubject,
  version: 2,
  payload: Schema.FiniteFromString
})
const Other = Fact.make("example.other", {
  subject: testSubject,
  version: 1,
  payload: Schema.String
})
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Log.Log | WorkspaceId.CurrentWorkspaceId | Transaction.Transaction | Publication.Publication | Checkpoint.Checkpoint
  >
) =>
  program.pipe(
    Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
    Effect.provide(Log.layer),
    Effect.provideService(Store.Store, fixture.store),
    Effect.provideService(WorkspaceId.CurrentWorkspaceId, fixture.workspaceId),
    Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints)
  )
it.effect("storage keeps the fact header separate and filtered entry pages preserve mixed-version commit order", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* Journal.make({ logId, projections: [] })
        const events = yield* journal.commit(
          Effect.gen(function* () {
            const first = yield* journal.publish(Changed, 1)
            yield* journal.publish(Other, "between")
            const second = yield* journal.publish(Changed, 2)
            const third = yield* journal.publish(Changed2, 3)
            return [first, second, third] as const
          })
        )
        const stored = (yield* fixture.store.read(logId, { limit: 1 }))[0]?.entries
        expect(stored).toHaveLength(4)
        const firstStored = stored?.[0]
        if (firstStored === undefined) return yield* Effect.die("Missing stored entry")
        // Storage indexes the name and subject; the version and provenance travel in the bytes.
        expect(firstStored).toMatchObject({ name: Changed.name, subject: testSubject() })
        expect(yield* Event.storageCodec.decode(firstStored)).toEqual({
          subject: testSubject(),
          name: Changed.name,
          version: 1,
          provenance: events[0]?.provenance,
          payload: yield* Codec.makeForSchema(Changed.payload).encode(1)
        })
        const firstPage = yield* journal.log.readEntries({
          subject: testSubject(),
          name: Changed.name,
          limit: 1
        })
        const first = firstPage[0]
        if (first === undefined) return yield* Effect.die("Missing first fact")
        expect(yield* Event.decode(Changed, first)).toEqual(events[0])
        const secondPage = yield* journal.log.readEntries({
          subject: testSubject(),
          name: Changed.name,
          after: first,
          limit: 2
        })
        expect(secondPage.map((entry) => entry.id)).toEqual(events.slice(1).map((event) => event.id))
        expect(secondPage.map((entry) => entry.index)).toEqual([2, 3])
        expect(yield* journal.log.readEntries({ name: "absent", limit: 10 })).toEqual([])
        expect((yield* journal.log.read({ limit: 1 }))[0]?.entries).toHaveLength(4)
        const plain = (yield* Log.Log).open({ id: logId, schema: Schema.Uint8Array })
        expect((yield* Effect.flip(plain.read({ limit: 1 })))._tag).toBe("SchemaError")
      })
    )
  })
)

it.effect("filtered reads reject malformed adapter pages instead of skipping or leaking entries", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* Journal.make({ logId, projections: [] })
        yield* journal.commit(Effect.all([journal.publish(Changed, 1), journal.publish(Changed, 2)]))
      })
    )
    const original = (yield* fixture.store.read(logId, { limit: 1 }))[0]?.entries
    if (original === undefined || original[0] === undefined) throw new Error("Missing stored entries")
    const first = original[0]
    const withoutName = { ...first }
    Reflect.deleteProperty(withoutName, "name")
    for (const entries of [
      [...original].reverse(),
      [first, first],
      [...original, first],
      [{ ...first, logId: Entry.LogId.make("other") }],
      [{ ...first, name: Other.name }],
      [{ ...first, subject: Subject.make("test", "other") }],
      [withoutName]
    ]) {
      const broken: Fixture = {
        ...fixture,
        store: { ...fixture.store, readEntries: () => Effect.succeed(entries) }
      }
      yield* run(
        broken,
        Effect.gen(function* () {
          const journal = yield* Journal.make({ logId, projections: [] })
          expect(
            (yield* Effect.flip(journal.log.readEntries({ subject: testSubject(), name: Changed.name, limit: 2 })))._tag
          ).toBe("SchemaError")
        })
      )
    }
  })
)

it.effect("subjects are required, namespaced, and derived only from validated payloads", () =>
  Effect.gen(function* () {
    expect(Subject.make("thread", "same:id")).not.toBe(Subject.make("member", "same:id"))
    expect(() => Subject.make("thread:one", "two")).toThrow()
    expect(() => Subject.make("thread", "")).toThrow()
    let calls = 0
    const fact = Fact.make("subject.validated", {
      version: 1,
      payload: Schema.Struct({ id: Schema.NonEmptyString }),
      subject: ({ id }) => {
        calls++
        return Subject.make("thread", id)
      }
    })
    yield* Effect.gen(function* () {
      expect((yield* Effect.flip(Fact.makeSubject(fact, { id: "" })))._tag).toBe("SchemaError")
      expect(calls).toBe(0)
      expect(yield* Fact.makeSubject(fact, { id: "one" })).toBe(Subject.make("thread", "one"))
      const malformed = { ...fact }
      Reflect.set(malformed, "subject", () => "unqualified")
      expect((yield* Effect.flip(Fact.makeSubject(malformed, { id: "one" })))._tag).toBe("SchemaError")
    })
    const decode = Schema.decodeUnknownOption(Store.EntriesOptions)
    expect(decode({ limit: 1 })._tag).toBe("None")
    expect(decode({ subject: Subject.make("thread", "one"), limit: 1 })._tag).toBe("Some")
  })
)

it.effect("publication retries and replay decoding reject changed subject intent", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* Journal.make({ logId, projections: [] })
        const key = Store.IdempotencyKey.make("subject-retry")
        const first = yield* journal.publish(Changed, 1, { idempotencyKey: key })
        expect(yield* journal.publish(Changed, 1, { idempotencyKey: key })).toEqual(first)
        const changed = Fact.make(Changed.name, {
          version: Changed.version,
          payload: Changed.payload,
          subject: () => Subject.make("test", "other")
        })
        expect(yield* Effect.flip(journal.publish(changed, 1, { idempotencyKey: key }))).toMatchObject({
          _tag: "StoreError",
          reason: { _tag: "Rejected" }
        })
        const page = yield* journal.log.readEntries({ subject: testSubject(), limit: 10 })
        const entry = page[0]
        if (entry === undefined) return yield* Effect.die("Missing event")
        expect(
          (yield* Effect.flip(
            Event.decode(Changed, {
              ...entry,
              payload: Object.assign({}, entry.payload, { subject: Subject.make("test", "wrong") })
            })
          ))._tag
        ).toBe("Event.FactMismatch")
        expect(page).toHaveLength(1)
      })
    )
  })
)

it.effect("entry lookup decodes one ID within its log and observes staged entries without opening a transaction", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    yield* run(
      fixture,
      Effect.gen(function* () {
        const log = yield* Log.Log
        const plain = log.open({ id: Entry.LogId.make("plain"), schema: Schema.String })
        const other = log.open({ id: Entry.LogId.make("other"), schema: Schema.String })
        const written = yield* plain.append("value")
        const before = yield* fixture.snapshot
        const attempts = yield* fixture.attempts
        expect(yield* plain.getEntry(written.id)).toEqual(Option.some(written))
        expect((yield* other.getEntry(written.id))._tag).toBe("None")
        expect(yield* fixture.snapshot).toEqual(before)
        expect(yield* fixture.attempts).toBe(attempts)
        const outcome = yield* Effect.flip(
          log.commit(
            Effect.gen(function* () {
              const staged = yield* plain.append("staged")
              expect(yield* plain.getEntry(staged.id)).toEqual(Option.some(staged))
              return yield* Effect.fail("rollback")
            })
          )
        )
        expect(outcome).toBe("rollback")
        expect(yield* fixture.snapshot).toEqual(before)
      })
    )
  })
)
